use crate::{Page, SceneError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Experimental native project container; this is not yet Forma's disk format.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) revision: u64,
    pub(crate) pages: Vec<Page>,
    /// Original legacy envelope retained until conversion can be proven lossless.
    pub(crate) legacy: Option<Value>,
    /// Revision at which the retained legacy snapshot was captured, if known.
    #[serde(default)]
    pub(crate) legacy_snapshot_revision: Option<u64>,
    /// Unrecognized project-level data, retained during round trips.
    #[serde(flatten)]
    pub(crate) extras: BTreeMap<String, Value>,
}

/// A native project has invalid metadata or page contents.
#[derive(Debug, PartialEq, Eq)]
pub enum ProjectModelError {
    EmptyId,
    NoPages,
    DuplicatePageId(String),
    InvalidPage { id: String, error: SceneError },
    DuplicateField(String),
    RevisionOverflow,
}

impl fmt::Display for ProjectModelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for ProjectModelError {}

impl Project {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn pages(&self) -> &[Page] {
        &self.pages
    }

    pub fn legacy_snapshot(&self) -> Option<&Value> {
        self.legacy.as_ref()
    }

    pub fn extras(&self) -> &BTreeMap<String, Value> {
        &self.extras
    }

    /// True only when the retained legacy payload was captured at the current revision.
    /// Older serialized projects without this marker are treated conservatively as stale.
    pub fn legacy_snapshot_is_current(&self) -> bool {
        self.legacy.is_some() && self.legacy_snapshot_revision == Some(self.revision)
    }

    /// Applies a page edit atomically, validates it, advances the revision, and marks
    /// the retained legacy snapshot stale by keeping its original capture revision.
    pub fn edit_pages(
        &mut self,
        edit: impl FnOnce(&mut Vec<Page>),
    ) -> Result<(), ProjectModelError> {
        let mut pages = self.pages.clone();
        edit(&mut pages);
        if pages == self.pages {
            return Ok(());
        }

        let next_revision = self
            .revision
            .checked_add(1)
            .ok_or(ProjectModelError::RevisionOverflow)?;
        let mut staged = self.clone();
        staged.pages = pages;
        staged.revision = next_revision;
        staged.validate()?;
        *self = staged;
        Ok(())
    }

    /// Validates project identity and each page's hierarchy and geometry.
    pub fn validate(&self) -> Result<(), ProjectModelError> {
        if self.id.is_empty() {
            return Err(ProjectModelError::EmptyId);
        }
        if self.pages.is_empty() {
            return Err(ProjectModelError::NoPages);
        }
        if let Some(key) = self.extras.keys().find(|key| {
            [
                "id",
                "name",
                "revision",
                "pages",
                "legacy",
                "legacy_snapshot_revision",
            ]
            .contains(&key.as_str())
        }) {
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
            legacy_snapshot_revision: None,
            extras: BTreeMap::new(),
        }
    }

    #[test]
    fn preserves_legacy_and_future_fields_across_project_round_trip() {
        let source = json!({"pages":[],"handoff":{"custom":"unchanged"}});
        let mut p = project();
        p.legacy = Some(source.clone());
        p.legacy_snapshot_revision = None;
        p.extras.insert("future".into(), json!({"enabled":true}));
        let restored = Project::from_json(&p.to_json().unwrap()).unwrap();
        assert_eq!(restored, p);
        assert_eq!(restored.legacy_snapshot(), Some(&source));
        assert!(!restored.legacy_snapshot_is_current());
        assert_eq!(restored.revision, 7);
    }

    #[test]
    fn page_edits_advance_revision_and_make_the_legacy_snapshot_stale_without_discarding_it() {
        let source = json!({"pages":[],"handoff":{"custom":"unchanged"}});
        let mut p = project();
        p.legacy = Some(source.clone());
        p.legacy_snapshot_revision = Some(p.revision);
        assert!(p.legacy_snapshot_is_current());

        p.edit_pages(|pages| {
            pages[0].nodes.get_mut("root").unwrap().name = "Edited".into();
        })
        .unwrap();

        assert_eq!(p.revision(), 8);
        assert_eq!(p.pages()[0].nodes["root"].name, "Edited");
        assert_eq!(p.legacy_snapshot(), Some(&source));
        assert!(!p.legacy_snapshot_is_current());

        let restored = Project::from_json(&p.to_json().unwrap()).unwrap();
        assert_eq!(restored.legacy_snapshot(), Some(&source));
        assert!(!restored.legacy_snapshot_is_current());
    }

    #[test]
    fn invalid_page_edits_are_atomic_and_noops_do_not_change_revision() {
        let mut p = project();
        let original = p.clone();
        p.edit_pages(|_| {}).unwrap();
        assert_eq!(p, original);

        assert_eq!(p.edit_pages(Vec::clear), Err(ProjectModelError::NoPages));
        assert_eq!(p, original);
    }

    #[test]
    fn projects_without_a_legacy_capture_revision_are_treated_as_stale() {
        let mut value = serde_json::to_value(project()).unwrap();
        value
            .as_object_mut()
            .unwrap()
            .remove("legacy_snapshot_revision");
        value["legacy"] = json!({"pages":[]});

        let restored = Project::from_json(&value.to_string()).unwrap();
        assert!(!restored.legacy_snapshot_is_current());
    }

    #[test]
    fn revision_overflow_does_not_apply_a_page_edit() {
        let mut p = project();
        p.revision = u64::MAX;
        let original = p.clone();

        assert_eq!(
            p.edit_pages(|pages| pages[0].name = "Changed".into()),
            Err(ProjectModelError::RevisionOverflow)
        );
        assert_eq!(p, original);
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
