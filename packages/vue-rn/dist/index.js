"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  RNDocument: () => import_rn_dom.RNDocument,
  createApp: () => createApp,
  getOrCreateDocument: () => getOrCreateDocument,
  useCssModule: () => useCssModule
});
module.exports = __toCommonJS(src_exports);
var import_react_native = require("react-native");
var import_runtime_core = require("@vue/runtime-core");
var import_rn_dom = require("@rasenjs/rn-dom");
var _doc = null;
function patchStyle(el, prev, next) {
  (0, import_rn_dom.applyStylePatch)(
    (key, value) => el.style.setProperty(key, value),
    (key) => el.style.removeProperty(key),
    prev,
    next
  );
}
function createVueRenderer() {
  return (0, import_runtime_core.createRenderer)({
    insert(child, parent, anchor) {
      parent.insertBefore(child, anchor ?? void 0);
    },
    remove(child) {
      child.parentNode?.removeChild(child);
    },
    createElement(tag) {
      return _doc.createElement(tag);
    },
    createText(text) {
      return _doc.createTextNode(text);
    },
    createComment(text) {
      return _doc.createComment(text);
    },
    setText(node, text) {
      ;
      node.textContent = text;
    },
    setElementText(el, text) {
      el.textContent = text;
    },
    parentNode(node) {
      return node.parentNode;
    },
    nextSibling(node) {
      return node.nextSibling ?? null;
    },
    patchProp(el, key, prevValue, nextValue) {
      if (key === "class") return;
      if (key === "style") {
        patchStyle(
          el,
          prevValue,
          nextValue
        );
        return;
      }
      if ((0, import_rn_dom.isEvent)(key)) {
        const rnKey = (0, import_rn_dom.normalizeEventName)(key);
        if (prevValue != null) el.removeAttribute(rnKey);
        if (nextValue != null) el.setAttribute(rnKey, nextValue);
        return;
      }
      if (nextValue == null) {
        el.removeAttribute(key);
      } else {
        el.setAttribute(key, nextValue);
      }
    },
    setScopeId() {
    },
    insertStaticContent() {
      return [];
    }
  });
}
function createApp(rootComponent) {
  const renderer = createVueRenderer();
  const app = renderer.createApp(rootComponent);
  return {
    unmount() {
      app.unmount();
    },
    use(plugin, ...options) {
      app.use(plugin, ...options);
      return this;
    },
    register(appName, setup) {
      import_react_native.AppRegistry.registerRunnable(appName, ({ rootTag }) => {
        const doc = getOrCreateDocument(rootTag);
        setup?.();
        _doc = doc;
        app.mount(doc.body);
      });
    }
  };
}
function getOrCreateDocument(rootTag) {
  return import_rn_dom.RNDocument.getOrCreate(rootTag);
}
function useCssModule(name = "$style") {
  const instance = (0, import_runtime_core.getCurrentInstance)();
  if (!instance) {
    return {};
  }
  const modules = instance.type.__cssModules;
  if (!modules) {
    return {};
  }
  const mod = modules[name];
  return mod ?? {};
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RNDocument,
  createApp,
  getOrCreateDocument,
  useCssModule
});
//# sourceMappingURL=index.js.map