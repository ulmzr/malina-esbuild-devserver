const serve = require("devlrserver");
const esbuild = require("esbuild");
const { sassPlugin } = require("esbuild-sass-plugin");
const malina = require("malinajs");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const cwd = process.cwd();
const watch = process.argv.includes("-w");
const env = fs.existsSync(path.join(cwd, "config.js")) ? require(path.join(cwd, "config.js")) : {};
const port = env.port || 8080;
const watchFiles = env.watch || "*.js";
const outdir = env.outdir || "public";
const esbuildConfig = env.esbuild || {};
const autoroute = env.autoroute;

const regex = /(.+[^\/])\/(\+.*.xht)/;
const regexC = /(.+[^\/])\/([A-Z].*.xht)/;
const exist = (filepath) => fs.existsSync(filepath);
const write = (filepath, content) => fs.writeFileSync(filepath, content, "utf8");

let ready;

serve({
   port,
   outdir,
   watch: watchFiles,
});

buildApp();
routeAuto();

async function buildApp() {
   const ctx = await esbuild.context({
      entryPoints: ["src/main.js"],
      bundle: true,
      minify: !watch,
      format: "iife",
      outdir,
      plugins: [malinaPlugin(), sassPlugin()],
      ...esbuildConfig,
   });
   ctx.watch();
   if (!watch) ctx.dispose();
}

function malinaPlugin() {
   const cssModules = new Map();
   console.log("! Malina.js", malina.version);
   return {
      name: "malina-plugin",
      setup(build) {
         build.onResolve({ filter: /^malinajs$/ }, async (args) => {
            const runtime = await build.resolve("malinajs/runtime.js", {
               resolveDir: args.resolveDir,
            });
            return {
               path: runtime.path,
               sideEffects: false,
            };
         });

         build.onResolve({ filter: /\.(xht|ma|html)$/ }, (arg) => {
            return {
               path: path.resolve(arg.resolveDir, arg.path),
               sideEffects: false,
            };
         });

         build.onLoad({ filter: /\.(xht|ma|html)$/ }, async (args) => {
            let source = await fsp.readFile(args.path, "utf8");

            let ctx = await malina.compile(source, {
               path: args.path,
               name: args.path.match(/([^/\\]+)\.\w+$/)[1],
            });

            let code = ctx.result;

            if (ctx.css.result) {
               const cssPath = args.path.replace(/\.\w+$/, ".malina.css").replace(/\\/g, "/");
               cssModules.set(cssPath, ctx.css.result);
               code += `\nimport "${cssPath}";`;
            }

            return { contents: code };
         });

         build.onResolve({ filter: /\.malina\.css$/ }, ({ path }) => {
            return { path, namespace: "malinacss" };
         });

         build.onLoad({ filter: /\.malina\.css$/, namespace: "malinacss" }, ({ path }) => {
            const css = cssModules.get(path);
            return css ? { contents: css, loader: "css" } : null;
         });
      },
   };
}

function routeAuto() {
   if (!autoroute) return;
   createRoutes();
   const chokidar = require("chokidar");
   chokidar
      .watch(["src/components", "src/modules", "src/pages"], {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         cwd,
      })
      .on("ready", () => (ready = true))
      .on("change", (fpath) => createPagesJS(fpath))
      .on("add", (fpath) => createPagesJS(fpath))
      .on("unlink", (fpath) => createPagesJS(fpath))
      .on("unlinkDir", (dir) => createRoutes(dir))
      .on("addDir", (dir) => {
         if (!dir.includes("pages") || !ready) return;
         dir = dir.replace(/\\/g, "/");
         let content = 'export * from "../components";\nexport * from "../modules";\n';
         if (dir.match(/src\/pages\/\w+/)) content = `export * from "../"`;
         write(dir + "/index.js", content);
      });
}

function createIndexXht(pathname) {
   pathname = pathname.replaceAll("\\", "/");
   let isMatch = pathname.match(regex);
   if (isMatch) {
      let dirname = isMatch[1];
      if (!exist(dirname)) return;
      if (!exist(path.join(dirname, "Index.xht"))) {
         write(
            path.join(dirname, "Index.xht"),
            `<script>
\timport * as pages from "./pages";
\texport let params = {};\n
\tlet page = pages.home;\n
\t$: params, page = !params.page ? pages.home : pages[params.page?.replace(/[-+:]/g, "_")];
</script>\n
{#if page}
\t<component:page/>
{:else}
\t<E404/>
{/if}`
         );
         createRoutes();
      }
   }
}

function createPagesJS(pathname) {
   if (!ready) return;
   pathname = pathname.replaceAll("\\", "/");
   if (pathname.startsWith("src/pages")) {
      let isMatch = pathname.match(regex);
      if (isMatch) {
         let dirname = isMatch[1];
         if (!exist(dirname)) return;
         if (!exist(path.join(dirname, "+home.xht"))) {
            write(path.join(dirname, "+home.xht"), "");
         }
         let files = getFiles(dirname);
         files = files.filter((file) => file.match(regex));
         files = files.map((file) => {
            let filename = file.match(regex)[2];
            let cmp = filename.slice(1).replace(".xht", "").replace(/[-+:]/g, "_");
            return `export { default as ${cmp} } from "./${filename}"\n`;
         });
         write(path.join(dirname, "pages.js"), files.join(""));
         createIndexXht(pathname);
      }
   } else if (pathname.startsWith("src/components") || pathname.startsWith("src/modules")) {
      let isMatch = pathname.match(regexC);
      if (isMatch) {
         let dirname = isMatch[1];
         if (!exist(dirname)) return;
         let files = getFiles(dirname);
         files = files.filter((file) => file.match(regexC));
         files = files.map((file) => {
            let filename = file.match(regexC)[2];
            let cmp = filename.replace(".xht", "").replace(/[-+:]/g, "_");
            return `export { default as ${cmp} } from "./${filename}"\n`;
         });
         write(path.join(dirname, "index.js"), files.join(""));
      }
   }
}

function getFiles(dir, recursive = 0) {
   let res = [];
   let list = fs.readdirSync(dir);
   list.forEach(function (file) {
      file = dir + "/" + file;
      let stat = fs.statSync(file);
      if (stat && stat.isDirectory() && recursive) res = res.concat(getFiles(file, recursive));
      else res.push(file);
   });
   res = res.map((x) => {
      return x.replaceAll("\\", "/");
   });
   return res;
}

function createRoutes(pathname) {
   if (pathname && !pathname.includes("pages")) return;
   let files = getFiles("src/pages", 1);
   files = files.reverse();
   let result1 = "";
   let result2 = "\nexport default [\n";
   files = files = files.map((filepath) => {
      let filename = filepath.split("/");
      filename = filename[filename.length - 1];
      let match = filename.endsWith(".xht") && filename[0].match(/[A-Z]/);
      if (match) {
         let cmp1 = filename.replace(".xht", "");
         let pathname = filepath
            .replace(/.xht|src\/pages/g, "")
            .toLowerCase()
            .replace("index", ":page");
         let cmp2;
         if (cmp1 === "Index") {
            cmp2 = filepath
               .replace("/" + filename, "")
               .split("/")
               .map((x) => x[0].toUpperCase() + x.slice(1));
            cmp2 = "page" + cmp2.slice(2).join("");
         }
         result1 += `import ${cmp2 ? cmp2 : cmp1} from "${filepath.replace("src", ".")}";\n`;
         result2 += `\t{ path: "${pathname === "/home" ? "/" : pathname}", page: ${cmp2 ? cmp2 : cmp1} },\n`;
      }
   });
   result2 += "]";
   write("src/routes.js", result1 + result2);
}
