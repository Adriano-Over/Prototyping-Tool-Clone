use forma_core::LegacyProject;
use serde_json::{json, Value};
use std::{env, error::Error, fs};

fn main() -> Result<(), Box<dyn Error>> {
    let input_path = env::args_os()
        .nth(1)
        .ok_or("usage: legacy-parity-probe <project.json>")?;
    let source: Value = serde_json::from_slice(&fs::read(input_path)?)?;
    let report = LegacyProject::from_json(source)?.project_simple_pages("parity-probe")?;
    let editor = report
        .project
        .legacy_snapshot()
        .and_then(|legacy| legacy.pointer("/editor/grapesjs"))
        .cloned()
        .ok_or("Forma editor payload was not retained")?;
    println!(
        "{}",
        serde_json::to_string(&json!({
            "editor": editor,
            "pages": report.project.pages(),
            "warnings": report.warnings
        }))?
    );
    Ok(())
}
