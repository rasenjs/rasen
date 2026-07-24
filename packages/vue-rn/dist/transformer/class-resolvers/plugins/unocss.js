"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const module_1 = require("module");
const parse_1 = require("../parse");
const NAME = 'unocss';
function detect() {
    const root = process.cwd();
    const nm = (0, path_1.join)(root, 'node_modules');
    try {
        if ((0, fs_1.existsSync)((0, path_1.join)(nm, '@unocss', 'core', 'package.json')) && (0, fs_1.existsSync)((0, path_1.join)(nm, '@unocss', 'preset-uno', 'package.json')))
            return true;
    }
    catch { /* not found */ }
    for (const name of ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts']) {
        if ((0, fs_1.existsSync)((0, path_1.join)(root, name)))
            return true;
    }
    return false;
}
async function resolve() {
    const root = process.cwd();
    const sm = new Map();
    let out = '';
    try {
        const projectRequire = (0, module_1.createRequire)((0, path_1.join)(root, 'package.json'));
        const { createGenerator } = projectRequire('@unocss/core');
        const pre = projectRequire('@unocss/preset-uno').default;
        let userConfig = {};
        for (const name of ['uno.config.js', 'uno.config.ts', 'unocss.config.js', 'unocss.config.ts']) {
            const f = (0, path_1.join)(root, name);
            if ((0, fs_1.existsSync)(f)) {
                try {
                    userConfig = projectRequire(f);
                }
                catch { /* config not found */ }
            }
        }
        const config = { ...userConfig, presets: [...(userConfig.presets || []), pre()] };
        const uno = await createGenerator(config);
        const classes = scanClasses(root).join(' ');
        if (classes) {
            const r = await uno.generate(classes, { preflights: false });
            out = r.css;
            for (const [k, v] of (0, parse_1.cssToMap)(out))
                sm.set(k, v);
        }
        const safelist = userConfig.safelist || [];
        if (safelist.length > 0) {
            const r = await uno.generate(safelist.join(' '), { preflights: false });
            out += '\n' + r.css;
            for (const [k, v] of (0, parse_1.cssToMap)(r.css))
                sm.set(k, v);
        }
    }
    catch {
        console.warn('[unocss] CSS generation failed');
    }
    return { styleMap: sm, cssOutput: out };
}
function scanClasses(root) {
    const s = new Set();
    function walk(dir) {
        let e;
        try {
            e = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const x of e) {
            const p = (0, path_1.join)(dir, x.name);
            if (x.isDirectory()) {
                if (!x.name.startsWith('.') && x.name !== 'node_modules' && x.name !== 'dist')
                    walk(p);
            }
            else if (x.name.endsWith('.vue') || x.name.endsWith('.tsx') || x.name.endsWith('.jsx')) {
                try {
                    for (const m of (0, fs_1.readFileSync)(p, 'utf8').matchAll(/class="([^"]+)"/g)) {
                        for (const c of m[1].trim().split(/\s+/))
                            if (c)
                                s.add(c);
                    }
                }
                catch { /* skip unreadable */ }
            }
        }
    }
    walk(root);
    return [...s];
}
const resolver = { name: NAME, detect, resolve };
exports.default = resolver;
