const http = require("http");
const fsp = require("fs").promises;
const path = require("path");
const WebSocket = require("ws");
const chokidar = require("chokidar");

const malina = require("malinajs");
const esbuild = require("esbuild");
const { sassPlugin } = require("esbuild-sass-plugin");

const cwd = process.cwd();
const dev = process.argv.includes("-watch");
const build = process.argv.includes("-build");
const config = require(path.join(cwd, "config.js")) || {};
const port = config.port || 3000;
const public = config.public || "public";
const esbuildConfig = config.esbuild || {};
const env = config.env || {};

if (!build) {
   const server = http.createServer(async (req, res) => {
      const filePath = path.join(cwd, public, req.url === "/" ? "index.html" : req.url); // Get the file path based on the requested URL
      const contentType = getContentType(filePath); // Get the content type based on the file extension
      if (filePath.endsWith("index.html")) serveIndexHtml(res);
      else
         try {
            // Read the file
            const data = await fsp.readFile(filePath);
            // Serve the requested file
            res.writeHead(200, { "Content-Type": contentType });
            res.end(data);
            if (dev) console.log("🌏", path.basename(filePath));
         } catch (error) {
            // If the file does not exist or there's an error reading it, serve index.html instead
            serveIndexHtml(res);
         }
   });

   // Function to serve index.html
   async function serveIndexHtml(res) {
      const reloadScript = `<script>
   let ws = 'ws://' + window.location.host;
   let sock = new WebSocket(ws)
   sock.onmessage = () => location.reload()
   sock.onclose = function(){
      reconnect()
      function reconnect(){
         sock = new WebSocket(ws)
         sock.onclose = () => setTimeout(reconnect, 2000)
         sock.onopen = () => location.reload()
      }
   }
   </script></head>`;
      try {
         const indexPath = path.join(cwd, public, "index.html");
         let data = await fsp.readFile(indexPath, "utf8");
         data = dev ? data.replace("</head>", reloadScript) : data;
         res.writeHead(200, { "Content-Type": "text/html" });
         res.end(data);
         if (dev) console.log("🌏", "index.html");
      } catch (error) {
         res.writeHead(500, { "Content-Type": "text/plain" });
         res.end("Internal Server Error");
      }
   }

   if (dev) compile();

   // Start the server
   server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
      if (dev) {
         const wss = new WebSocket.Server({ server });
         const publicFolderPath = path.join(cwd, "public");

         // Initialize chokidar to watch for file changes
         const watcher = chokidar.watch(publicFolderPath, { persistent: true });

         watcher.on("change", (filePath) => {
            // Notify all clients about the file change
            wss.clients.forEach((client) => {
               if (client.readyState === WebSocket.OPEN) {
                  client.send("reload");
               }
            });
         });
      }
   });

   // Function to get content type based on file extension
   function getContentType(filePath) {
      const mime = {
         html: "text/html",
         css: "text/css",
         js: "text/javascript",
         json: "application/json",
         ico: "image/ico",
         png: "image/png",
         jpg: "image/jpg",
         jpeg: "image/jpeg",
         webp: "image/webp",
         gif: "image/gif",
         svg: "image/svg+xml",
         mp3: "audio/mpeg",
         wav: "audio/wav",
         ogg: "audio/ogg",
         mp4: "video/mp4",
         webm: "video/webm",
         ogv: "video/ogg",
         pdf: "application/pdf",
      };
      const extname = path.extname(filePath)?.slice(1);
      return mime[extname] || "application/octet-stream";
   }
} else {
   compile();
}

async function compile() {
   const ctx = await esbuild.context({
      entryPoints: ["src/main.js"],
      outfile: public + "/main.js",
      bundle: true,
      minify: !dev,
      plugins: [malinaPlugin(), sassPlugin()],
      define: {
         process: JSON.stringify({
            env: {
               production: !dev,
               ...env,
            },
         }),
      },
      ...esbuildConfig,
   });

   await ctx.watch();
   if (!dev) await ctx.dispose();
}

function malinaPlugin(options = {}) {
   const cssModules = new Map();

   if (options.displayVersion !== false) console.log("! Malina.js", malina.version);

   return {
      name: "malina-plugin",
      setup(build) {
         build.onResolve({ filter: /^malinajs$/ }, async (args) => {
            const runtime = await build.resolve("malinajs/runtime.js", {
               resolveDir: args.resolveDir,
               kind: args.kind,
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
               ...options,
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
