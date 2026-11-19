use crate::{LegacyProject, Page, SceneError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Experimental native project container; this is not yet Forma's disk format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub revision: u64,
    pub pages: Vec<Page>,
    /// Original legacy envelope retained until conversion can be proven lossless.
    pub legacy: Option<Value>,
    /// Unrecognized project-level data, retained during round trips.
    #[serde(flatten)]
    pub extras: BTreeMap<String, Value>,
}

/// A native project has invalid metadata or page contents.
#[derive(Debug, PartialEq, Eq)]
pub enum ProjectModelError {
    EmptyId,
    NoPages,
    DuplicatePageId(String),
    InvalidPage { id: String, error: SceneError },
    DuplicateField(String),
}

impl fmt::Display for ProjectModelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for ProjectModelError {}

impl Project {
    /// Attaches a validated legacy envelope without changing its contents.
    pub fn retain_legacy(&mut self, legacy: LegacyProject) {
        self.legacy = Some(legacy.into_json());
    }

    /// Validates project identity and each page's hierarchy and geometry.
    pub fn validate(&self) -> Result<(), ProjectModelError> {
        if self.id.is_empty() {
            return Err(ProjectModelError::EmptyId);
        }
        if self.pages.is_empty() {
            return Err(ProjectModelError::NoPages);
        }
        if let Some(key) = self
            .extras
            .keys()
            .find(|key| ["id", "name", "revision", "pages", "legacy"].contains(&key.as_str()))
        {
            return Err(ProjectModelError::DuplicateField(key.clone()));
        }
        let mut ids = BTreeSet::new();
        for page in &self.pages {
            if !ids.insert(&page.id) {
                return Err(ProjectModelError::DuplicatePageId(page.id.clone()));
            }
            page.validate()
                .map_err(|error| ProjectModelError::InvalidPage {
                    id: page.id.clone(),
                    error,
                })?;
        }
        Ok(())
    }

    /// Decode and validate an experimental native project.
    pub fn from_json(json: &str) -> Result<Self, String> {
        let project: Self = serde_json::from_str(json).map_err(|error| error.to_string())?;
        project.validate().map_err(|error| error.to_string())?;
        Ok(project)
    }

    /// Validate and encode an experimental native project.
    pub fn to_json(&self) -> Result<String, String> {
        self.validate().map_err(|error| error.to_string())?;
        serde_json::to_string(self).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Affine, Node, NodeKind, Size};
    use serde_json::json;

    fn project() -> Project {
        let node = Node {
            name: "Root".into(),
            kind: NodeKind::Frame,
            transform: Affine::default(),
            size: Size {
                width: 100.0,
                height: 100.0,
                extras: BTreeMap::new(),
            },
            visible: true,
            locked: false,
            children: vec![],
            extras: BTreeMap::new(),
        };
        Project {
            id: "project".into(),
            name: "Design".into(),
            revision: 7,
            pages: vec![Page {
                id: "page".into(),
                name: "Page".into(),
                root: "root".into(),
                nodes: BTreeMap::from([("root".into(), node)]),
                extras: BTreeMap::new(),
            }],
            legacy: None,
            extras: BTreeMap::new(),
        }
    }

    #[test]
    fn preserves_legacy_and_future_fields_across_project_round_trip() {
        let source = json!({"pages":[],"handoff":{"custom":"unchanged"}});
        let mut p = project();
        p.retain_legacy(LegacyProject::from_json(source.clone()).unwrap());
        p.extras.insert("future".into(), json!({"enabled":true}));
        let restored = Project::from_json(&p.to_json().unwrap()).unwrap();
        assert_eq!(restored, p);
        assert_eq!(restored.legacy, Some(source));
        assert_eq!(restored.revision, 7);
    }

    #[test]
    fn rejects_duplicate_pages_and_invalid_embedded_scenes() {
        let mut p = project();
        p.pages.push(p.pages[0].clone());
        assert_eq!(
            p.validate(),
            Err(ProjectModelError::DuplicatePageId("page".into()))
        );
        p.pages.pop();
        p.pages[0].root = "missing".into();
        assert!(matches!(
            p.validate(),
            Err(ProjectModelError::InvalidPage {
                error: SceneError::MissingNode(_),
                ..
            })
        ));
        let raw = serde_json::to_string(&p).unwrap();
        assert!(Project::from_json(&raw).is_err());
        p.pages.clear();
        assert_eq!(p.validate(), Err(ProjectModelError::NoPages));
    }
}
