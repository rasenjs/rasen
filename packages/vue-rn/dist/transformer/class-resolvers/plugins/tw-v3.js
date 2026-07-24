"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const module_1 = require("module");
const parse_1 = require("../parse");
const NAME = 'tailwind-v3';
function findPackage(root, pkgName) {
    let dir = root;
    while (dir !== (0, path_1.dirname)(dir)) {
        const p = (0, path_1.join)(dir, 'node_modules', ...pkgName.split('/'), 'package.json');
        if ((0, fs_1.existsSync)(p))
            return JSON.parse((0, fs_1.readFileSync)(p, 'utf8'));
        dir = (0, path_1.dirname)(dir);
    }
    return null;
}
function detect() {
    const root = process.cwd();
    for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs']) {
        if ((0, fs_1.existsSync)((0, path_1.join)(root, name)))
            return true;
    }
    const pkg = findPackage(root, 'tailwindcss');
    if (pkg && parseInt(pkg.version.split('.')[0], 10) < 4)
        return true;
    return false;
}
async function resolve() {
    const root = process.cwd();
    const classes = scanClasses(root);
    const projectRequire = (0, module_1.createRequire)((0, path_1.join)(root, 'package.json'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postcss = require('postcss');
    let config = {};
    for (const name of ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs']) {
        const f = (0, path_1.join)(root, name);
        if ((0, fs_1.existsSync)(f)) {
            delete require.cache[f];
            try {
                config = projectRequire(f);
            }
            catch { /* config parse error */ }
        }
    }
    const jitConfig = { ...config, content: config.content || [], safelist: (config.safelist || []).concat(classes) };
    const tw = (() => {
        try {
            return projectRequire('tailwindcss');
        }
        catch {
            return require('tailwindcss');
        }
    })();
    let out = '';
    try {
        const r = await postcss([tw(jitConfig)]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;', { from: (0, path_1.join)(root, 'tw.scss') });
        out = r.css;
    }
    catch {
        console.warn('[tw-v3] CSS generation failed');
    }
    return { styleMap: (0, parse_1.cssToMap)(out), cssOutput: out };
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
                catch { /* skip unreadable files */ }
            }
        }
    }
    walk(root);
    return [...s];
}
const resolver = { name: NAME, detect, resolve };
exports.default = resolver;
