const sassPlugin = require("malinajs/plugins/sass.js");

module.exports = function (option, filename) {
   option.compact = "full";
   option.hideLabel = true;
   option.debugLabel = true;
   option.css = false; // true - adds css to JS bundle, false - into outside css file, function - intercepts css for manual handling
   option.immutable = true; // if false it perform deep comparison of objects
   option.plugins = [sassPlugin()];
   option.autoimport = (name) => `import ${name} from './${name}.xht';`;
   return option;
};
