#![forbid(unsafe_code)]

//! Lossless access to existing Forma project envelopes during migration.
//!
//! This module preserves the original JSON and exposes its GrapesJS page data.
//! It does not yet convert the editor tree to a native scene graph.

use serde_json::Value;
use std::fmt;

mod history;
pub use history::{Command, History, HistoryError};

/// A validated legacy project, retaining all unknown fields for round trips.
#[derive(Debug, Clone, PartialEq)]
pub struct LegacyProject {
    original: Value,
    editor_path: EditorPath,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EditorPath {
    Forma,
    Data,
    Root,
}

/// An unsupported or invalid legacy project envelope.
#[derive(Debug, PartialEq, Eq)]
pub struct ProjectError(&'static str);

impl fmt::Display for ProjectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl std::error::Error for ProjectError {}

impl LegacyProject {
    /// Validates a supported legacy envelope without discarding its fields.
    pub fn from_json(value: Value) -> Result<Self, ProjectError> {
        if !value.is_object() {
            return Err(ProjectError("Project data must be an object"));
        }
        if value.get("format").and_then(Value::as_str) == Some("forma-project")
            && value
                .get("schemaVersion")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                > 3
        {
            return Err(ProjectError("Unsupported Forma project schema"));
        }
        let editor_path = if value
            .pointer("/editor/grapesjs/pages")
            .is_some_and(Value::is_array)
        {
            EditorPath::Forma
        } else if value.pointer("/data/pages").is_some_and(Value::is_array) {
            EditorPath::Data
        } else if value.get("pages").is_some_and(Value::is_array) {
            EditorPath::Root
        } else {
            return Err(ProjectError("Project does not contain GrapesJS pages"));
        };
        Ok(Self {
            original: value,
            editor_path,
        })
    }

    /// Returns the original editor data for inspection.
    pub fn editor(&self) -> &Value {
        match self.editor_path {
            EditorPath::Forma => &self.original["editor"]["grapesjs"],
            EditorPath::Data => &self.original["data"],
            EditorPath::Root => &self.original,
        }
    }

    /// Returns the original JSON, including fields unknown to Forma.
    pub fn into_json(self) -> Value {
        self.original
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixtures_round_trip_without_losing_fields() {
        for text in [
            include_str!("../../../../fixtures/projects/legacy-pages.json"),
            include_str!("../../../../fixtures/projects/legacy-data.json"),
            include_str!("../../../../fixtures/projects/forma-v3.json"),
        ] {
            let original: Value = serde_json::from_str(text).unwrap();
            let project = LegacyProject::from_json(original.clone()).unwrap();
            assert!(!project.editor()["pages"].as_array().unwrap().is_empty());
            assert_eq!(project.into_json(), original);
        }
    }

    #[test]
    fn unknown_handoff_is_preserved_and_bad_envelopes_are_rejected() {
        let original = serde_json::json!({"data":{"pages":[]},"handoff":{"unknown":[1,2,3]}});
        assert_eq!(
            LegacyProject::from_json(original.clone())
                .unwrap()
                .into_json(),
            original
        );
        assert!(LegacyProject::from_json(serde_json::json!({"data":{}})).is_err());
        assert!(LegacyProject::from_json(
            serde_json::json!({"format":"forma-project","schemaVersion":4,"pages":[]})
        )
        .is_err());
    }
}
