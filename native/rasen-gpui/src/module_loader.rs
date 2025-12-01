//! Module loader that bundles npm packages for QuickJS
//!
//! Uses oxc_resolver for module resolution and transforms ESM to QuickJS-compatible format.

use anyhow::{Context as AnyhowContext, Result};
use oxc_resolver::{ResolveOptions, Resolver};
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Module loader that reads config and bundles dependencies
pub struct ModuleLoader {
    /// Working directory (where to find config)
    work_dir: PathBuf,
    bundled_runtime: Option<String>,
}

impl ModuleLoader {
    pub fn new(work_dir: &PathBuf) -> Self {
        Self {
            work_dir: work_dir.clone(),
            bundled_runtime: None,
        }
    }
    
    /// Load modules based on config file in work_dir
    pub fn load_modules(&mut self, _script: &str) -> Result<()> {
        // Look for rasen.config.js in work_dir
        let config_path = self.work_dir.join("rasen.config.js");
        if !config_path.exists() {
            return Ok(());
        }
        
        // Parse the config file to extract aliases
        let config_content = fs::read_to_string(&config_path)?;
        
        let aliases = parse_config(&config_content);
        
        // Bundle all modules using work_dir as base for resolving paths
        let bundle = bundle_modules(&self.work_dir, &aliases)?;
        self.bundled_runtime = Some(bundle);
        
        Ok(())
    }
    
    /// Get the bundled runtime code
    pub fn get_bundled_runtime(&self) -> Option<&str> {
        self.bundled_runtime.as_deref()
    }
}

/// Parse rasen.config.js to extract module aliases
fn parse_config(content: &str) -> HashMap<String, String> {
    let mut aliases = HashMap::new();
    
    // Remove comments first
    let re_line_comment = Regex::new(r"//.*").unwrap();
    let re_block_comment = Regex::new(r"/\*[\s\S]*?\*/").unwrap();
    let content = re_line_comment.replace_all(content, "");
    let content = re_block_comment.replace_all(&content, "");
    
    // Extract 'name': 'path' patterns from modules object
    let re = Regex::new(r#"['"](@?[\w\-/]+)['"]\s*:\s*['"]([^'"]+)['"]"#).unwrap();
    
    for cap in re.captures_iter(&content) {
        let name = cap[1].to_string();
        let path = cap[2].to_string();
        aliases.insert(name, path);
    }
    
    aliases
}

/// A loaded module with its transformed code
#[derive(Debug)]
struct Module {
    /// Canonical path (unique identifier)
    path: PathBuf,
    /// Original source code
    source: String,
    /// Dependencies (canonical paths)
    #[allow(dead_code)]
    dependencies: Vec<PathBuf>,
}

/// Loads and bundles modules starting from entry points
fn bundle_modules(base_dir: &Path, aliases: &HashMap<String, String>) -> Result<String> {
    let resolver = create_resolver(base_dir, aliases);

    // Track loaded modules and their order
    let mut modules: HashMap<PathBuf, Module> = HashMap::new();
    let mut load_order: Vec<PathBuf> = Vec::new();

    // Load entry points
    for (name, path) in aliases {
        let full_path = base_dir.join(path);
        let canonical = full_path
            .canonicalize()
            .with_context(|| format!("Cannot resolve entry '{}'", name))?;

        load_module_recursive(
            &canonical,
            &resolver,
            &mut modules,
            &mut load_order,
            &mut HashSet::new(),
        )?;
    }

    // Build the bundle
    let mut bundle = String::new();
    bundle.push_str("(function() {\n");
    bundle.push_str("  'use strict';\n");
    bundle.push_str("  var __modules = {};\n");
    bundle.push_str("  var __cache = {};\n\n");

    // require function
    bundle.push_str("  function __require(id) {\n");
    bundle.push_str("    if (__cache[id]) return __cache[id].exports;\n");
    bundle.push_str("    var module = { exports: {} };\n");
    bundle.push_str("    __cache[id] = module;\n");
    bundle.push_str("    __modules[id](module, module.exports, __require);\n");
    bundle.push_str("    return module.exports;\n");
    bundle.push_str("  }\n\n");

    // Define modules in dependency order (leaves first)
    for path in &load_order {
        let module = modules.get(path).unwrap();
        let transformed = transform_module(&module.source, path, &modules)?;

        // Use path string as module ID
        let id = path.to_string_lossy();
        bundle.push_str(&format!(
            "  __modules[{:?}] = function(module, exports, require) {{\n",
            id
        ));
        bundle.push_str(&transformed);
        bundle.push_str("\n  };\n\n");
    }

    // Map aliases to their canonical paths
    bundle.push_str("  var __aliases = {\n");
    for (name, rel_path) in aliases {
        let full_path = base_dir.join(rel_path);
        if let Ok(canonical) = full_path.canonicalize() {
            let id = canonical.to_string_lossy();
            bundle.push_str(&format!("    {:?}: {:?},\n", name, id));
        }
    }
    bundle.push_str("  };\n\n");

    // Export resolver
    bundle.push_str("  globalThis.__requireAlias = function(name) {\n");
    bundle.push_str("    var id = __aliases[name];\n");
    bundle.push_str("    if (!id) throw new Error('Unknown module: ' + name);\n");
    bundle.push_str("    return __require(id);\n");
    bundle.push_str("  };\n\n");

    // Initialize all modules and register aliases to global __modules
    bundle.push_str("  // Register aliased modules to global __modules\n");
    bundle.push_str("  if (typeof globalThis.__modules === 'undefined') globalThis.__modules = {};\n");
    for (name, rel_path) in aliases {
        let full_path = base_dir.join(rel_path);
        if let Ok(canonical) = full_path.canonicalize() {
            let id = canonical.to_string_lossy();
            bundle.push_str(&format!(
                "  globalThis.__modules[{:?}] = __require({:?});\n",
                name, id
            ));
        }
    }

    bundle.push_str("})();\n");

    Ok(bundle)
}

/// Recursively load a module and its dependencies
fn load_module_recursive(
    path: &PathBuf,
    resolver: &Resolver,
    modules: &mut HashMap<PathBuf, Module>,
    load_order: &mut Vec<PathBuf>,
    visiting: &mut HashSet<PathBuf>,
) -> Result<()> {
    // Already loaded?
    if modules.contains_key(path) {
        return Ok(());
    }

    // Circular dependency check
    if visiting.contains(path) {
        // Not an error, just skip
        return Ok(());
    }

    visiting.insert(path.clone());

    let source = fs::read_to_string(path)
        .with_context(|| format!("Cannot read {:?}", path))?;

    // Parse imports
    let imports = parse_imports(&source);

    // Resolve dependencies
    let mut dependencies = Vec::new();
    let dir = path.parent().unwrap();

    for import in &imports {
        if let Some(resolved) = resolve_import(resolver, dir, import) {
            dependencies.push(resolved);
        }
    }

    // Load dependencies first (DFS)
    for dep in &dependencies {
        load_module_recursive(dep, resolver, modules, load_order, visiting)?;
    }

    // Add this module
    modules.insert(
        path.clone(),
        Module {
            path: path.clone(),
            source,
            dependencies,
        },
    );
    load_order.push(path.clone());

    visiting.remove(path);
    Ok(())
}

/// Parse import specifiers from ESM source
fn parse_imports(source: &str) -> Vec<String> {
    let mut imports = Vec::new();

    // import ... from "..."
    let re_import = Regex::new(r#"import\s+.*?\s+from\s+['"]([^'"]+)['"]"#).unwrap();
    for cap in re_import.captures_iter(source) {
        imports.push(cap[1].to_string());
    }

    // export ... from "..."
    let re_export = Regex::new(r#"export\s+.*?\s+from\s+['"]([^'"]+)['"]"#).unwrap();
    for cap in re_export.captures_iter(source) {
        imports.push(cap[1].to_string());
    }

    // import("...")
    let re_dynamic = Regex::new(r#"import\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    for cap in re_dynamic.captures_iter(source) {
        imports.push(cap[1].to_string());
    }

    imports
}

/// Resolve an import specifier to a canonical path
fn resolve_import(resolver: &Resolver, dir: &Path, specifier: &str) -> Option<PathBuf> {
    match resolver.resolve(dir, specifier) {
        Ok(resolution) => Some(resolution.path().to_path_buf()),
        Err(_) => None,
    }
}

/// Transform ESM module to CommonJS
fn transform_module(
    source: &str,
    module_path: &PathBuf,
    modules: &HashMap<PathBuf, Module>,
) -> Result<String> {
    let dir = module_path.parent().unwrap();
    let mut code = source.to_string();

    // Build a map of import specifiers to canonical paths for this module
    let _module = modules.get(module_path).unwrap();
    let imports = parse_imports(source);

    // Create resolver just for path mapping
    let resolver = Resolver::new(ResolveOptions {
        extensions: vec![".js".into(), ".mjs".into(), ".cjs".into()],
        main_fields: vec!["module".into(), "main".into()],
        condition_names: vec!["import".into(), "require".into(), "default".into()],
        ..Default::default()
    });

    // Map specifiers to canonical paths
    let mut spec_to_path: HashMap<String, String> = HashMap::new();
    for spec in &imports {
        if let Some(resolved) = resolve_import(&resolver, dir, spec) {
            spec_to_path.insert(spec.clone(), resolved.to_string_lossy().to_string());
        }
    }

    // Transform import declarations to require calls
    // import { a, b } from "mod" -> const { a, b } = require("path")
    let re_named = Regex::new(r#"import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]"#).unwrap();
    code = re_named
        .replace_all(&code, |caps: &regex::Captures| {
            let names = &caps[1];
            let spec = &caps[2];
            let path = spec_to_path.get(spec).cloned().unwrap_or(spec.to_string());
            format!("const {{{}}} = require({:?})", names, path)
        })
        .to_string();

    // import def from "mod" -> const def = require("path").default || require("path")
    let re_default = Regex::new(r#"import\s+(\w+)\s+from\s*['"]([^'"]+)['"]"#).unwrap();
    code = re_default
        .replace_all(&code, |caps: &regex::Captures| {
            let name = &caps[1];
            let spec = &caps[2];
            let path = spec_to_path.get(spec).cloned().unwrap_or(spec.to_string());
            format!(
                "const {} = (function(){{ var m = require({:?}); return m.default || m; }})()",
                name, path
            )
        })
        .to_string();

    // import * as x from "mod" -> const x = require("path")
    let re_star = Regex::new(r#"import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]"#).unwrap();
    code = re_star
        .replace_all(&code, |caps: &regex::Captures| {
            let name = &caps[1];
            let spec = &caps[2];
            let path = spec_to_path.get(spec).cloned().unwrap_or(spec.to_string());
            format!("const {} = require({:?})", name, path)
        })
        .to_string();

    // export { a, b } from "mod" -> Object.assign(exports, require("path"))
    let re_reexport =
        Regex::new(r#"export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]"#).unwrap();
    code = re_reexport
        .replace_all(&code, |caps: &regex::Captures| {
            let names = &caps[1];
            let spec = &caps[2];
            let path = spec_to_path.get(spec).cloned().unwrap_or(spec.to_string());
            // Parse individual names and re-export them
            let name_list: Vec<&str> = names.split(',').map(|s| s.trim()).collect();
            let mut assigns = Vec::new();
            for n in name_list {
                // Handle "x as y" syntax
                let parts: Vec<&str> = n.split(" as ").collect();
                let (from_name, to_name) = if parts.len() == 2 {
                    (parts[0].trim(), parts[1].trim())
                } else {
                    (n, n)
                };
                assigns.push(format!("exports.{} = require({:?}).{}", to_name, path, from_name));
            }
            assigns.join("; ")
        })
        .to_string();

    // export * from "mod" -> Object.assign(exports, require("path"))
    let re_star_export = Regex::new(r#"export\s*\*\s*from\s*['"]([^'"]+)['"]"#).unwrap();
    code = re_star_export
        .replace_all(&code, |caps: &regex::Captures| {
            let spec = &caps[1];
            let path = spec_to_path.get(spec).cloned().unwrap_or(spec.to_string());
            format!("Object.assign(exports, require({:?}))", path)
        })
        .to_string();

    // export { a, b } (without from) -> exports.a = a; exports.b = b
    // Since we already handled "export { } from", remaining "export { }" won't have "from"
    let re_export_names = Regex::new(r#"export\s*\{([^}]+)\}"#).unwrap();
    code = re_export_names
        .replace_all(&code, |caps: &regex::Captures| {
            let full_match = &caps[0];
            // Skip if this is a re-export (contains "from")
            if full_match.contains("from") {
                return full_match.to_string();
            }
            let names = &caps[1];
            let parts: Vec<&str> = names.split(',').map(|s| s.trim()).collect();
            let mut result = Vec::new();
            for p in parts {
                // Handle "x as y"
                let as_parts: Vec<&str> = p.split(" as ").collect();
                let (local, exported) = if as_parts.len() == 2 {
                    (as_parts[0].trim(), as_parts[1].trim())
                } else {
                    (p, p)
                };
                result.push(format!("exports.{} = {}", exported, local));
            }
            result.join("; ")
        })
        .to_string();

    // export const/let/var/function/class
    let re_export_decl =
        Regex::new(r#"export\s+(const|let|var|function|class)\s+(\w+)"#).unwrap();
    code = re_export_decl
        .replace_all(&code, |caps: &regex::Captures| {
            let keyword = &caps[1];
            let name = &caps[2];
            format!("{} {}; exports.{} = {}", keyword, name, name, name)
        })
        .to_string();

    // export default -> exports.default =
    code = code.replace("export default", "exports.default =");

    Ok(code)
}

/// Create resolver with aliases
fn create_resolver(base_dir: &Path, aliases: &HashMap<String, String>) -> Resolver {
    let mut alias_list: Vec<(String, Vec<oxc_resolver::AliasValue>)> = Vec::new();

    for (name, path) in aliases {
        let full_path = base_dir.join(path);
        if let Ok(canonical) = full_path.canonicalize() {
            alias_list.push((
                name.clone(),
                vec![oxc_resolver::AliasValue::Path(
                    canonical.to_string_lossy().to_string(),
                )],
            ));
        }
    }

    Resolver::new(ResolveOptions {
        alias: alias_list,
        extensions: vec![".js".into(), ".mjs".into(), ".cjs".into()],
        main_fields: vec!["module".into(), "main".into()],
        condition_names: vec!["import".into(), "require".into(), "default".into()],
        ..Default::default()
    })
}
