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
var index_exports = {};
__export(index_exports, {
  RNDocument: () => import_rn_dom.RNDocument,
  RouterLink: () => RouterLink,
  createApp: () => createApp,
  useCssModule: () => useCssModule
});
module.exports = __toCommonJS(index_exports);
var import_runtime_core2 = require("@vue/runtime-core");
var import_rn_dom = require("@rasenjs/rn-dom");

// src/router-link.ts
var import_runtime_core = require("@vue/runtime-core");
var import_vue_router = require("vue-router");
function isTextNode(vnode) {
  return typeof vnode.children === "string" || typeof vnode.children === "number";
}
function wrapText(vnodes) {
  return vnodes.map((v) => isTextNode(v) ? (0, import_runtime_core.h)("Text", null, v.children) : v);
}
var RouterLink = /* @__PURE__ */ (0, import_runtime_core.defineComponent)({
  name: "RouterLink",
  props: {
    to: { type: [String, Object], required: true },
    replace: Boolean,
    /**
     * When true, renders only the slot content without wrapping View.
     * Use this when you need full control over the touchable wrapper.
     */
    custom: Boolean
  },
  setup(props, { slots }) {
    const link = (0, import_vue_router.useLink)(props);
    return () => {
      var _a, _b;
      const scope = {
        route: link.route,
        href: link.href,
        isActive: link.isActive,
        isExactActive: link.isExactActive,
        navigate: link.navigate
      };
      const slotContent = (_b = (_a = slots.default) == null ? void 0 : _a.call(slots, scope)) != null ? _b : [];
      if (props.custom) {
        return slotContent.length === 0 ? (0, import_runtime_core.h)("View") : slotContent;
      }
      return (0, import_runtime_core.h)("View", { onTouchEnd: link.navigate }, wrapText(slotContent));
    };
  }
});

// src/index.ts
var _doc = null;
function patchStyle(el, prev, next) {
  if (prev) {
    const prevObj = typeof prev === "string" ? (0, import_rn_dom.parseCSS)(prev) : prev;
    for (const key of Object.keys(prevObj)) {
      el.style.removeProperty(key);
    }
  }
  if (next) {
    const nextObj = typeof next === "string" ? (0, import_rn_dom.parseCSS)(next) : next;
    for (const [key, value] of Object.entries(nextObj)) {
      el.style.setProperty(key, value);
    }
  }
}
function createVueRenderer() {
  return (0, import_runtime_core2.createRenderer)({
    insert(child, parent, anchor) {
      parent.insertBefore(child, anchor != null ? anchor : void 0);
    },
    remove(child) {
      var _a;
      (_a = child.parentNode) == null ? void 0 : _a.removeChild(child);
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
      var _a;
      return (_a = node.nextSibling) != null ? _a : null;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertStaticContent() {
      return null;
    }
  });
}
function createApp(rootComponent) {
  const renderer = createVueRenderer();
  const app = renderer.createApp(rootComponent);
  return {
    mount(container) {
      _doc = container.ownerDocument;
      app.mount(container);
      _doc.body.completeFabric();
    },
    unmount() {
      app.unmount();
    },
    use(plugin, ...options) {
      app.use(plugin, ...options);
      return this;
    }
  };
}
function useCssModule(name = "$style") {
  const instance = (0, import_runtime_core2.getCurrentInstance)();
  if (!instance) {
    return {};
  }
  const modules = instance.type.__cssModules;
  if (!modules) {
    return {};
  }
  const mod = modules[name];
  return mod != null ? mod : {};
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RNDocument,
  RouterLink,
  createApp,
  useCssModule
});
