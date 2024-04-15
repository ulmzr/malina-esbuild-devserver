(() => {
  // node_modules/malinajs/runtime.js
  var current_destroyList;
  var current_mountList;
  var current_cd;
  var $onDestroy = (fn) => fn && current_destroyList.push(fn);
  var __app_onerror = console.error;
  var isFunction = (fn) => typeof fn == "function";
  var isObject = (d) => typeof d == "object";
  var safeCall = (fn) => {
    try {
      return fn?.();
    } catch (e) {
      __app_onerror(e);
    }
  };
  var safeGroupCall = (list) => {
    try {
      list?.forEach((fn) => fn?.());
    } catch (e) {
      __app_onerror(e);
    }
  };
  var safeGroupCall2 = (list, resultList, onlyFunction) => {
    list?.forEach((fn) => {
      let r = safeCall(fn);
      r && (!onlyFunction || isFunction(r)) && resultList.push(r);
    });
  };
  function WatchObject(fn, cb) {
    this.fn = fn;
    this.cb = cb;
    this.value = NaN;
    this.cmp = null;
  }
  function $watch(fn, callback, option) {
    let w = new WatchObject(fn, callback);
    option && Object.assign(w, option);
    current_cd.watchers.push(w);
    return w;
  }
  function addEvent(el, event, callback) {
    if (!callback)
      return;
    el.addEventListener(event, callback);
    $onDestroy(() => {
      el.removeEventListener(event, callback);
    });
  }
  function $ChangeDetector(parent) {
    this.parent = parent;
    this.children = [];
    this.watchers = [];
    this.prefix = [];
  }
  var cd_new = (parent) => new $ChangeDetector(parent);
  var isArray = (a) => Array.isArray(a);
  var _compareDeep = (a, b, lvl) => {
    if (lvl < 0 || !a || !b)
      return a !== b;
    if (a === b)
      return false;
    let o0 = isObject(a);
    let o1 = isObject(b);
    if (!(o0 && o1))
      return a !== b;
    let a0 = isArray(a);
    let a1 = isArray(b);
    if (a0 !== a1)
      return true;
    if (a0) {
      if (a.length !== b.length)
        return true;
      for (let i = 0; i < a.length; i++) {
        if (_compareDeep(a[i], b[i], lvl - 1))
          return true;
      }
    } else if (a instanceof Date) {
      if (b instanceof Date)
        return +a !== +b;
    } else {
      let set = {};
      for (let k in a) {
        if (_compareDeep(a[k], b[k], lvl - 1))
          return true;
        set[k] = true;
      }
      for (let k in b) {
        if (set[k])
          continue;
        return true;
      }
    }
    return false;
  };
  function cloneDeep(d, lvl) {
    if (lvl < 0 || !d)
      return d;
    if (isObject(d)) {
      if (d instanceof Date)
        return d;
      if (d instanceof Element)
        return d;
      if (isArray(d))
        return d.map((i) => cloneDeep(i, lvl - 1));
      let r = {};
      for (let k in d)
        r[k] = cloneDeep(d[k], lvl - 1);
      return r;
    }
    return d;
  }
  function deepComparator(depth) {
    return function(w, value) {
      let diff = _compareDeep(w.value, value, depth);
      diff && (w.value = cloneDeep(value, depth), !w.idle && w.cb(value));
      w.idle = false;
    };
  }
  var compareDeep = deepComparator(10);
  function $digest($cd, flag) {
    let loop = 10;
    let w;
    while (loop >= 0) {
      let index = 0;
      let queue = [];
      let i, value, cd = $cd, changes = 0;
      while (cd) {
        for (i = 0; i < cd.prefix.length; i++)
          cd.prefix[i]();
        for (i = 0; i < cd.watchers.length; i++) {
          w = cd.watchers[i];
          value = w.fn();
          if (w.value !== value) {
            flag[0] = 0;
            if (w.cmp) {
              w.cmp(w, value);
            } else {
              w.cb(w.value = value);
            }
            changes += flag[0];
          }
        }
        if (cd.children.length)
          queue.push.apply(queue, cd.children);
        cd = queue[index++];
      }
      loop--;
      if (!changes)
        break;
    }
    if (loop < 0)
      __app_onerror("Infinity changes: ", w);
  }
  var templatecache = {};
  var htmlToFragmentClean = (html, option) => {
    let result = templatecache[html];
    if (!result) {
      let t = document.createElement("template");
      t.innerHTML = html.replace(/<>/g, "<!---->");
      result = t.content;
      let it = document.createNodeIterator(result, 128);
      let n;
      while (n = it.nextNode()) {
        if (!n.nodeValue)
          n.parentNode.replaceChild(document.createTextNode(""), n);
      }
      if (!(option & 2) && result.firstChild == result.lastChild)
        result = result.firstChild;
      templatecache[html] = result;
    }
    return option & 1 ? result.cloneNode(true) : result;
  };
  var iterNodes = (el, last, fn) => {
    let next;
    while (el) {
      next = el.nextSibling;
      fn(el);
      if (el == last)
        break;
      el = next;
    }
  };
  var removeElements = (el, last) => iterNodes(el, last, (n) => n.remove());
  var resolvedPromise = Promise.resolve();
  function $tick(fn) {
    fn && resolvedPromise.then(fn);
    return resolvedPromise;
  }
  var current_component;
  var $context;
  var makeApply = () => {
    let $cd = current_component.$cd = current_cd = cd_new();
    $cd.component = current_component;
    let planned, flag = [0];
    let apply = (r) => {
      flag[0]++;
      if (planned)
        return r;
      planned = true;
      $tick(() => {
        try {
          $digest($cd, flag);
        } finally {
          planned = false;
        }
      });
      return r;
    };
    current_component.$apply = apply;
    current_component.$push = apply;
    apply();
    return apply;
  };
  var makeComponent = (init) => {
    return ($option = {}) => {
      $context = $option.context || {};
      let prev_component = current_component, prev_cd = current_cd, $component = current_component = { $option };
      current_cd = null;
      try {
        $component.$dom = init($option);
      } finally {
        current_component = prev_component;
        current_cd = prev_cd;
        $context = null;
      }
      return $component;
    };
  };
  var bindText = (element, fn) => {
    $watch(() => "" + fn(), (value) => {
      element.textContent = value;
    });
  };
  var bindStyle = (element, name, fn) => {
    $watch(fn, (value) => {
      element.style.setProperty(name, value);
    });
  };
  var bindInput = (element, name, get, set) => {
    let w = $watch(name == "checked" ? () => !!get() : get, (value) => {
      element[name] = value == null ? "" : value;
    });
    addEvent(element, "input", () => {
      set(w.value = element[name]);
    });
  };
  var prefixPush = (fn) => {
    current_cd.prefix.push(fn);
    fn();
  };
  var mount = (label, component, option) => {
    let app, first, last, destroyList = current_destroyList = [];
    current_mountList = [];
    try {
      app = component(option);
      let $dom = app.$dom;
      delete app.$dom;
      if ($dom.nodeType == 11) {
        first = $dom.firstChild;
        last = $dom.lastChild;
      } else
        first = last = $dom;
      label.appendChild($dom);
      safeGroupCall2(current_mountList, destroyList);
    } finally {
      current_destroyList = current_mountList = null;
    }
    app.destroy = () => {
      safeGroupCall(destroyList);
      removeElements(first, last);
    };
    return app;
  };
  var refer = (active, line) => {
    let result = [], i, v;
    const code = (x, d) => x.charCodeAt() - d;
    for (i = 0; i < line.length; i++) {
      let a = line[i];
      switch (a) {
        case ">":
          active = active.firstChild;
          break;
        case "+":
          active = active.firstChild;
        case ".":
          result.push(active);
          break;
        case "!":
          v = code(line[++i], 48) * 42 + code(line[++i], 48);
          while (v--)
            active = active.nextSibling;
          break;
        case "#":
          active = result[code(line[++i], 48) * 26 + code(line[++i], 48)];
          break;
        default:
          v = code(a, 0);
          if (v >= 97)
            active = result[v - 97];
          else {
            v -= 48;
            while (v--)
              active = active.nextSibling;
          }
      }
    }
    return result;
  };

  // src/App.xht
  var App_default = makeComponent(($option) => {
    const $$apply = makeApply();
    let name = "world";
    var degrees;
    prefixPush(() => {
      degrees = (name.length - 5) * 5;
    });
    {
      const $parentElement = htmlToFragmentClean(`<img src="/malinajs.svg" alt="Malina.js Logo" class="mnbrvn5"/><h1 class="mnbrvn5"> </h1><div class="mnbrvn5"><input type="text" class="mnbrvn5"/></div><div class="mnbrvn5">Edit and save file<code>src/App.xht</code>to reload</div>`, 1);
      let [el0, el4, el1, el3] = refer($parentElement, "+1.+b1+");
      bindStyle(el0, "transform", () => `rotate(${degrees}deg)`);
      bindText(el1, () => `Hello ${name}!`);
      bindInput(el3, "value", () => name, ($$a2) => {
        name = $$a2;
        $$apply();
      });
      $tick(() => {
        let $element = el3;
        $element.focus();
        $$apply();
      });
      return $parentElement;
    }
  });

  // src/main.js
  mount(document.body, App_default);
})();
