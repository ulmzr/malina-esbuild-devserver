const serve = require("devlrserver");
const esbuild = require("esbuild");
const { sassPlugin } = require("esbuild-sass-plugin");
const malina = require("malinajs");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const cwd = process.cwd();
const watch = process.argv.includes("-w");
const env = fs.existsSync(path.join(cwd, "config.js")) ? require(path.join(cwd, "config.js")) : {};
const port = env.port || 8080;
const watchFiles = env.watch || "*.js";
const outdir = env.outdir || "public";
const esbuildConfig = env.esbuild || {};
const autoroute = env.autoroute;

serve({
   port,
   outdir,
   watch: watchFiles,
});

buildApp();
createRoutes();
watching();

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

function watching() {
   if (!watch) return;
   const chokidar = require("chokidar");
   let ready;
   chokidar
      .watch(["src/components", "src/modules", "src/pages"], {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         cwd,
      })
      .on("add", (pathname) => {
         if (!ready) return;
         addDeleteFile(pathname);
      })
      .on("unlink", (pathname) => {
         if (!ready) return;
         addDeleteFile(pathname);
      })
      .on("addDir", (dir) => {
         if (!ready) return;
         dir = dir.replace(/\\/g, "/");
         if (!dir.includes("/pages/") && dir === "src/pages") return;
         createRoutes();
         if (!fs.existsSync(path.join(dir, "pages.js"))) fs.writeFileSync(path.join(dir, "pages.js"), "");
         if (!fs.existsSync(path.join(dir, "pageIndex.xht"))) {
            let content = `<script>\n\timport * as pages from "./pages.js";\n\texport let params = {};\n\tconst page = pages[params.page];\n</script>\n\n{#if page}\n\t<component:page />\n{:else}\n{/if}\n `;
            fs.writeFileSync(path.join(dir, "pageIndex.xht"), content);
         }
      })
      .on("unlinkDir", (path) => {
         if (!ready || !path.includes("pages")) return;
         createRoutes();
      })
      .on("ready", (path) => {
         ready = true;
      });
}

function addDeleteFile(pathname) {
   createRoutes();
   pathname = pathname.replace(/\\/g, "/");
   if (!pathname.endsWith(".svelte")) return;
   let dir = /.*(?<=\/)/.exec(pathname)[0];
   if (dir[dir.length - 1] === "/") dir = dir.slice(0, -1);
   let _files = getCmp(dir);
   let files = _files.filter((x) => {
      return !x.includes("/+");
   });
   let pages = _files.filter((x) => {
      return x.includes("/+");
   });
   files = files.join("");
   pages = pages.join("");
   if (dir.includes("pages")) {
      if (dir === "src/pages") {
         files += 'export * from "../components";\nexport * from "../modules";\n';
      } else files += 'export * from "../";\n';
      if (files) fs.writeFileSync(path.join(dir, "index.js"), files);
      if (pages) fs.writeFileSync(path.join(dir, "pages.js"), pages);
   } else fs.writeFileSync(path.join(dir, "index.js"), files);
}

function getCmp(dir, recursive = 0) {
   let res = getFiles(dir, recursive);
   res = res
      .filter((x) => x.endsWith(".xht") && !x.includes("pageIndex.xht"))
      .map((x) => {
         let cmp = /(\w+).xht/g.exec(x);
         x = `export { default as ${cmp[1]} } from ".${x.replace(dir, "")}";\n`;
         return x;
      });
   return res;
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

function createRoutes() {
   if (!autoroute) return;
   let files = getFiles("src/pages", 1);
   files = files.filter((x) => {
      let f = x.split("/").slice(-1)[0];
      return x.includes("pageIndex.xht") || x.includes("Home.xht") || f[0].match(/[A-Z]/);
   });
   files = files.map((x) => {
      let cmp = x.split("/").slice(-1)[0].replace(".xht", "");
      let content = [
         `import ${cmp} from "${x.replace("src/", "")}";`,
         cmp === "Home" ? "/" : x.replace("pageIndex.xht", ":page"),
         cmp,
      ];
      return content;
   });

   let content = "";
   for (let i = 0; i < files.length; i++) {
      content += files[i][0] + "\n";
   }

   files = files.reverse();
   content += "export default [\n";
   for (let i = 0; i < files.length; i++) {
      content +=
         '\t{ path: "' +
         files[i][1].replace(/src\/pages|.xht/g, "").toLowerCase() +
         '", ' +
         "page: " +
         files[i][2] +
         " },\n";
   }
   content += "]";

   fs.writeFileSync("src/routes.js", content);
}
