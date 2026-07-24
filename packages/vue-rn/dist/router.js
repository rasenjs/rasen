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

// src/router.ts
var router_exports = {};
__export(router_exports, {
  RouterLink: () => RouterLink
});
module.exports = __toCommonJS(router_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RouterLink
});
