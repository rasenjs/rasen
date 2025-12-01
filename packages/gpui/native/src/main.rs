mod tw_parser;
mod js_runtime;
mod elements;
mod module_loader;
mod event_manager;

use anyhow::Result;
use clap::{Parser, Subcommand};
use gpui::*;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Parser)]
#[command(name = "rasen-gpui")]
#[command(about = "GPUI binding for Rasen - Run JavaScript UI with GPU acceleration")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Run a JavaScript/TypeScript file
    Run {
        /// Path to the script file or project directory (default: current directory)
        #[arg(default_value = ".")]
        path: PathBuf,
    },
    /// Initialize a new project
    Init {
        /// Project name
        #[arg(default_value = "my-gpui-app")]
        name: String,
    },
    /// Build the project
    Build {
        /// Output directory
        #[arg(short, long, default_value = "dist")]
        outdir: String,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Run { path } => run_script(&path),
        Commands::Init { name } => init_project(&name),
        Commands::Build { outdir } => build_project(&outdir),
    }
}

fn run_script(path: &PathBuf) -> Result<()> {
    // Determine script file and working directory
    let (script_file, work_dir) = if path.is_dir() {
        // Directory provided - look for src/main.ts or src/main.js
        let main_ts = path.join("src/main.ts");
        let main_js = path.join("src/main.js");
        let index_ts = path.join("src/index.ts");
        let index_js = path.join("src/index.js");
        
        let script = if main_ts.exists() {
            main_ts
        } else if main_js.exists() {
            main_js
        } else if index_ts.exists() {
            index_ts
        } else if index_js.exists() {
            index_js
        } else {
            anyhow::bail!("No entry file found. Expected src/main.ts, src/main.js, src/index.ts, or src/index.js");
        };
        (script, path.clone())
    } else {
        // File provided directly
        let dir = path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."));
        (path.clone(), dir)
    };
    
    let script = fs::read_to_string(&script_file)?;
    
    // Load modules from config in work_dir (cwd)
    let mut loader = module_loader::ModuleLoader::new(&work_dir);
    loader.load_modules(&script)?;

    Application::new().run(move |cx: &mut App| {
        // Initialize JS runtime with loaded modules
        let runtime = Arc::new(js_runtime::JsRuntime::new());
        
        // Execute the script and get the root element
        let root = runtime.execute_with_modules(&script, &loader)
            .expect("Failed to execute script");
        
        let event_manager = runtime.event_manager();

        // Open window with the rendered element
        let bounds = Bounds::centered(None, size(px(800.), px(600.)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_, cx| {
                cx.new(|_| AppRoot { 
                    element: root,
                    runtime: runtime.clone(),
                    event_manager: event_manager.clone(),
                })
            },
        )
        .unwrap();
        
        cx.activate(true);
    });

    Ok(())
}

fn init_project(name: &str) -> Result<()> {
    use std::fs;
    use std::path::Path;

    let target_dir = Path::new(name);
    
    if target_dir.exists() {
        anyhow::bail!("Directory '{}' already exists", name);
    }

    fs::create_dir_all(target_dir.join("src"))?;

    // package.json
    let pkg = serde_json::json!({
        "name": name,
        "version": "0.0.1",
        "type": "module",
        "scripts": {
            "dev": "rasen-gpui run src/main.ts",
            "build": "rasen-gpui build"
        },
        "dependencies": {
            "@rasenjs/gpui": "workspace:*"
        }
    });
    fs::write(
        target_dir.join("package.json"),
        serde_json::to_string_pretty(&pkg)?,
    )?;

    // src/main.ts
    let main_ts = r#"import { div, text, run } from '@rasenjs/gpui'

const App = () =>
  div({
    class: "flex flex-col gap-4 bg-[#2e2e2e] size-full justify-center items-center",
    children: [
      text({
        class: "text-2xl text-white font-bold",
        text: "Hello, GPUI!",
      }),
      div({
        class: "flex gap-2",
        children: [
          div({ class: "size-8 bg-red-500 rounded-md" }),
          div({ class: "size-8 bg-green-500 rounded-md" }),
          div({ class: "size-8 bg-blue-500 rounded-md" }),
        ],
      }),
    ],
  })

run(App)
"#;
    fs::write(target_dir.join("src/main.ts"), main_ts)?;

    println!("✔ Project '{}' created successfully!", name);
    println!("\nNext steps:");
    println!("  cd {}", name);
    println!("  rasen-gpui run src/main.ts");

    Ok(())
}

fn build_project(_outdir: &str) -> Result<()> {
    // TODO: Bundle JS and assets
    println!("Build not implemented yet");
    Ok(())
}

struct AppRoot {
    element: elements::Element,
    runtime: Arc<js_runtime::JsRuntime>,
    event_manager: event_manager::EventManager,
}


impl Render for AppRoot {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let runtime = self.runtime.clone();
        let event_manager = self.event_manager.clone();
        let entity = cx.entity().clone();
        
        // Create render context with click handler factory
        let render_ctx = elements::RenderContext {
            click_handler: &|handler_id: event_manager::HandlerId| {
                let runtime = runtime.clone();
                let event_manager = event_manager.clone();
                let entity = entity.clone();
                
                Box::new(move |_event: &ClickEvent, _window: &mut Window, cx: &mut App| {
                    // Invoke the JS handler (this modifies ref values)
                    runtime.with_context(|ctx| {
                        event_manager.invoke_handler(handler_id, ctx);
                    });
                    
                    // Re-render: call App() again to get fresh UI with updated state
                    // The ref values persist because they are in closures
                    if let Ok(new_element) = runtime.re_render() {
                        let _ = entity.update(cx, |this: &mut AppRoot, cx| {
                            this.element = new_element;
                            cx.notify();
                        });
                    }
                })
            },
        };
        
        self.element.render_with_events(&render_ctx)
    }
}
