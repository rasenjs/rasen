"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const module_1 = require("module");
const parse_1 = require("../parse");
const NAME = 'tailwind-v4';
function findPackage(root, pkgName) {
    let dir = root;
    while (dir !== (0, path_1.dirname)(dir)) {
        const p = (0, path_1.join)(dir, 'node_modules', ...pkgName.split('/'), 'package.json');
        if ((0, fs_1.existsSync)(p))
            return p;
        dir = (0, path_1.dirname)(dir);
    }
    return null;
}
function detect() {
    const root = process.cwd();
    try {
        if (findPackage(root, '@tailwindcss/postcss'))
            return true;
    }
    catch { /* not found */ }
    try {
        const p = findPackage(root, 'tailwindcss');
        if (p) {
            const { version } = JSON.parse((0, fs_1.readFileSync)(p, 'utf8'));
            if (parseInt(version.split('.')[0], 10) >= 4)
                return true;
        }
    }
    catch { /* version check failed */ }
    return false;
}
async function resolve() {
    const root = process.cwd();
    const entry = findEntryCSS(root);
    const classes = scanClasses(root);
    let css;
    if (entry)
        css = entry.content;
    else
        css = `@import "tailwindcss";`;
    for (const cls of classes)
        css += `\n@source inline("${cls}");`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const postcss = require('postcss');
    const tw = (() => {
        try {
            return (0, module_1.createRequire)((0, path_1.join)(root, 'package.json'))('@tailwindcss/postcss');
        }
        catch {
            return require('tailwindcss');
        }
    })();
    let out = '';
    try {
        const r = await postcss([tw()]).process(css, { from: entry?.filePath || (0, path_1.join)(root, 'virtual.css') });
        out = r.css;
    }
    catch {
        console.warn('[tw-v4] CSS generation failed');
    }
    return { styleMap: (0, parse_1.cssToMap)(out), cssOutput: out };
}
function findEntryCSS(root) {
    for (const rel of ['src/global.css', 'app/global.css', 'global.css', 'src/index.css', 'app/index.css', 'src/main.css', 'app.css']) {
        const f = (0, path_1.join)(root, rel);
        if ((0, fs_1.existsSync)(f)) {
            const c = (0, fs_1.readFileSync)(f, 'utf8');
            if (c.includes('tailwind'))
                return { filePath: f, content: c };
        }
    }
    return null;
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
                if (!x.name.startsWith('.') && x.name !== 'node_modules')
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
