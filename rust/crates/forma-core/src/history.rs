use serde_json::Value;
use std::fmt;

/// A reversible change to a project document.
#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    /// Apply multiple changes atomically as one undoable action.
    Batch(Vec<Command>),
    /// Set an object property; `parent` is a JSON pointer to its existing parent.
    Set {
        parent: String,
        key: String,
        value: Value,
    },
    /// Remove an existing object property.
    Remove { parent: String, key: String },
    /// Insert a value into an existing array at an index from zero through its length.
    Insert {
        parent: String,
        index: usize,
        value: Value,
    },
    /// Remove a value at an existing array index.
    RemoveAt { parent: String, index: usize },
    /// Restore a removed object property at its original position.
    RestoreProperty {
        parent: String,
        key: String,
        index: usize,
        value: Value,
    },
}

/// A command could not be applied to the current document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryError(&'static str);

impl fmt::Display for HistoryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for HistoryError {}

impl Command {
    fn apply(&self, document: &mut Value) -> Result<Command, HistoryError> {
        match self {
            Command::Batch(commands) => {
                if commands.is_empty() {
                    return Err(HistoryError("A batch must contain at least one command"));
                }
                let mut staged = document.clone();
                let mut inverse = Vec::with_capacity(commands.len());
                for command in commands {
                    inverse.push(command.apply(&mut staged)?);
                }
                inverse.reverse();
                *document = staged;
                return Ok(Command::Batch(inverse));
            }
            Command::Insert {
                parent,
                index,
                value,
            } => {
                let array = document
                    .pointer_mut(parent)
                    .and_then(Value::as_array_mut)
                    .ok_or(HistoryError("Command parent must be an existing array"))?;
                if *index > array.len() {
                    return Err(HistoryError("Array insertion index out of bounds"));
                }
                array.insert(*index, value.clone());
                return Ok(Command::RemoveAt {
                    parent: parent.clone(),
                    index: *index,
                });
            }
            Command::RemoveAt { parent, index } => {
                let array = document
                    .pointer_mut(parent)
                    .and_then(Value::as_array_mut)
                    .ok_or(HistoryError("Command parent must be an existing array"))?;
                if *index >= array.len() {
                    return Err(HistoryError("Array removal index out of bounds"));
                }
                let value = array.remove(*index);
                return Ok(Command::Insert {
                    parent: parent.clone(),
                    index: *index,
                    value,
                });
            }
            Command::RestoreProperty {
                parent,
                key,
                index,
                value,
            } => {
                let object = document
                    .pointer_mut(parent)
                    .and_then(Value::as_object_mut)
                    .ok_or(HistoryError("Command parent must be an existing object"))?;
                if key.is_empty() || object.contains_key(key) || *index > object.len() {
                    return Err(HistoryError(
                        "Cannot restore object property at that position",
                    ));
                }
                let previous = std::mem::take(object);
                for (position, (existing_key, existing_value)) in previous.into_iter().enumerate() {
                    if position == *index {
                        object.insert(key.clone(), value.clone());
                    }
                    object.insert(existing_key, existing_value);
                }
                if *index == object.len() {
                    object.insert(key.clone(), value.clone());
                }
                return Ok(Command::Remove {
                    parent: parent.clone(),
                    key: key.clone(),
                });
            }
            _ => {}
        }
        let (parent, key) = match self {
            Command::Set { parent, key, .. } | Command::Remove { parent, key } => (parent, key),
            _ => unreachable!("array commands returned above"),
        };
        if key.is_empty() {
            return Err(HistoryError("Property name cannot be empty"));
        }
        let object = document
            .pointer_mut(parent)
            .and_then(Value::as_object_mut)
            .ok_or(HistoryError("Command parent must be an existing object"))?;
        match self {
            Command::Set { value, .. } => {
                let previous = object.insert(key.clone(), value.clone());
                Ok(match previous {
                    Some(value) => Command::Set {
                        parent: parent.clone(),
                        key: key.clone(),
                        value,
                    },
                    None => Command::Remove {
                        parent: parent.clone(),
                        key: key.clone(),
                    },
                })
            }
            Command::Remove { .. } => {
                let index = object
                    .keys()
                    .position(|existing| existing == key)
                    .ok_or(HistoryError("Property does not exist"))?;
                let value = object
                    .shift_remove(key)
                    .ok_or(HistoryError("Property does not exist"))?;
                Ok(Command::RestoreProperty {
                    parent: parent.clone(),
                    key: key.clone(),
                    index,
                    value,
                })
            }
            _ => unreachable!("array commands returned above"),
        }
    }
}

/// A single chronological undo and redo history for one JSON document.
#[derive(Debug, Default, Clone)]
pub struct History {
    undo: Vec<Command>,
    redo: Vec<Command>,
}

impl History {
    /// Applies a command and clears redo only after a successful change.
    pub fn execute(&mut self, document: &mut Value, command: Command) -> Result<(), HistoryError> {
        let inverse = command.apply(document)?;
        self.undo.push(inverse);
        self.redo.clear();
        Ok(())
    }

    /// Undoes the most recent command, returning false when there is none.
    pub fn undo(&mut self, document: &mut Value) -> Result<bool, HistoryError> {
        let Some(command) = self.undo.last() else {
            return Ok(false);
        };
        let inverse = command.apply(document)?;
        self.undo.pop();
        self.redo.push(inverse);
        Ok(true)
    }

    /// Redoes the most recently undone command, returning false when there is none.
    pub fn redo(&mut self, document: &mut Value) -> Result<bool, HistoryError> {
        let Some(command) = self.redo.last() else {
            return Ok(false);
        };
        let inverse = command.apply(document)?;
        self.redo.pop();
        self.undo.push(inverse);
        Ok(true)
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
}

/// Undo/redo history that applies JSON commands to a typed, validated Forma project.
#[derive(Debug, Default)]
pub struct ProjectHistory {
    history: History,
}

impl ProjectHistory {
    /// Applies a command within `/pages` and commits only if the resulting project validates.
    pub fn execute(
        &mut self,
        project: &mut crate::Project,
        command: Command,
    ) -> Result<(), HistoryError> {
        validate_project_command(&command)?;
        self.apply(project, |history, document| {
            history.execute(document, command)?;
            Ok(true)
        })
        .map(|_| ())
    }

    /// Sets a node's local affine transform by stable page and node IDs.
    pub fn set_node_transform(
        &mut self,
        project: &mut crate::Project,
        page_id: &str,
        node_id: &str,
        transform: crate::Affine,
    ) -> Result<(), HistoryError> {
        let page_index = project
            .pages()
            .iter()
            .position(|page| page.id == page_id)
            .ok_or(HistoryError("Project history page ID was not found"))?;
        if !project.pages()[page_index].nodes.contains_key(node_id) {
            return Err(HistoryError("Project history node ID was not found"));
        }
        let value = serde_json::to_value(transform)
            .map_err(|_| HistoryError("Project history could not encode the node transform"))?;
        let escaped_node_id = node_id.replace('~', "~0").replace('/', "~1");
        self.execute(
            project,
            Command::Set {
                parent: format!("/pages/{page_index}/nodes/{escaped_node_id}"),
                key: "transform".into(),
                value,
            },
        )
    }

    pub fn undo(&mut self, project: &mut crate::Project) -> Result<bool, HistoryError> {
        self.apply(project, |history, document| history.undo(document))
    }

    pub fn redo(&mut self, project: &mut crate::Project) -> Result<bool, HistoryError> {
        self.apply(project, |history, document| history.redo(document))
    }

    pub fn can_undo(&self) -> bool {
        self.history.can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.history.can_redo()
    }

    fn apply(
        &mut self,
        project: &mut crate::Project,
        operation: impl FnOnce(&mut History, &mut Value) -> Result<bool, HistoryError>,
    ) -> Result<bool, HistoryError> {
        let mut staged_history = self.history.clone();
        let mut document = serde_json::json!({ "pages": project.pages() });
        if !operation(&mut staged_history, &mut document)? {
            return Ok(false);
        }
        let pages: Vec<crate::Page> = serde_json::from_value(
            document
                .get("pages")
                .cloned()
                .ok_or(HistoryError("Project history removed the pages collection"))?,
        )
        .map_err(|_| HistoryError("Project history produced invalid page data"))?;
        if pages == project.pages() {
            return Ok(false);
        }
        project
            .edit_pages(|current| *current = pages)
            .map_err(|_| HistoryError("Project history edit violates scene invariants"))?;
        self.history = staged_history;
        Ok(true)
    }
}

fn validate_project_command(command: &Command) -> Result<(), HistoryError> {
    let valid_parent = |parent: &str| parent == "/pages" || parent.starts_with("/pages/");
    match command {
        Command::Batch(commands) => {
            if commands
                .iter()
                .any(|command| validate_project_command(command).is_err())
            {
                return Err(HistoryError(
                    "Project history commands must stay within /pages",
                ));
            }
        }
        Command::Set { parent, .. }
        | Command::Remove { parent, .. }
        | Command::Insert { parent, .. }
        | Command::RemoveAt { parent, .. }
        | Command::RestoreProperty { parent, .. } => {
            if !valid_parent(parent) {
                return Err(HistoryError(
                    "Project history commands must stay within /pages",
                ));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Affine, Node, NodeKind, Page, Project, Size};
    use serde_json::json;
    use std::collections::BTreeMap;

    fn project_with_snapshot() -> Project {
        Project {
            id: "project".into(),
            name: "Design".into(),
            revision: 3,
            pages: vec![Page {
                id: "page".into(),
                name: "Page".into(),
                root: "root".into(),
                nodes: BTreeMap::from([(
                    "root".into(),
                    Node {
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
                    },
                )]),
                extras: BTreeMap::new(),
            }],
            legacy: Some(json!({"source":"original"})),
            legacy_snapshot_revision: Some(3),
            extras: BTreeMap::new(),
        }
    }

    #[test]
    fn undo_redo_crosses_document_and_metadata_changes() {
        let original = json!({"editor":{"name":"Before"},"forma":{"comments":{}}});
        let mut doc = original.clone();
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Set {
                    parent: "/editor".into(),
                    key: "name".into(),
                    value: json!("After"),
                },
            )
            .unwrap();
        history
            .execute(
                &mut doc,
                Command::Set {
                    parent: "/forma/comments".into(),
                    key: "layer".into(),
                    value: json!(["Note"]),
                },
            )
            .unwrap();
        let edited = doc.clone();
        assert!(history.undo(&mut doc).unwrap());
        assert!(history.undo(&mut doc).unwrap());
        assert_eq!(doc, original);
        assert!(!history.undo(&mut doc).unwrap());
        assert!(history.redo(&mut doc).unwrap());
        assert!(history.redo(&mut doc).unwrap());
        assert_eq!(doc, edited);
    }

    #[test]
    fn invalid_changes_preserve_history_and_new_edits_clear_redo() {
        let mut doc = json!({"value":1});
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Set {
                    parent: "".into(),
                    key: "value".into(),
                    value: json!(2),
                },
            )
            .unwrap();
        history.undo(&mut doc).unwrap();
        assert!(history
            .execute(
                &mut doc,
                Command::Remove {
                    parent: "".into(),
                    key: "missing".into()
                }
            )
            .is_err());
        assert!(history.redo(&mut doc).unwrap());
        history.undo(&mut doc).unwrap();
        history
            .execute(
                &mut doc,
                Command::Set {
                    parent: "".into(),
                    key: "value".into(),
                    value: json!(3),
                },
            )
            .unwrap();
        assert!(!history.redo(&mut doc).unwrap());
        assert_eq!(doc, json!({"value":3}));
    }

    #[test]
    fn ordered_array_changes_undo_and_redo_with_other_document_edits() {
        let original = json!({"pages":[{"id":"one"},{"id":"three"}],"meta":{"name":"Before"}});
        let mut doc = original.clone();
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Insert {
                    parent: "/pages".into(),
                    index: 1,
                    value: json!({"id":"two"}),
                },
            )
            .unwrap();
        history
            .execute(
                &mut doc,
                Command::RemoveAt {
                    parent: "/pages".into(),
                    index: 0,
                },
            )
            .unwrap();
        history
            .execute(
                &mut doc,
                Command::Set {
                    parent: "/meta".into(),
                    key: "name".into(),
                    value: json!("After"),
                },
            )
            .unwrap();
        let edited = doc.clone();
        for _ in 0..3 {
            assert!(history.undo(&mut doc).unwrap());
        }
        assert_eq!(doc, original);
        for _ in 0..3 {
            assert!(history.redo(&mut doc).unwrap());
        }
        assert_eq!(doc, edited);
    }

    #[test]
    fn out_of_bounds_and_non_array_operations_do_not_mutate_or_erase_redo() {
        let mut doc = json!({"pages":["one"],"meta":{}});
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Insert {
                    parent: "/pages".into(),
                    index: 1,
                    value: json!("two"),
                },
            )
            .unwrap();
        history.undo(&mut doc).unwrap();
        let before = doc.clone();
        for command in [
            Command::Insert {
                parent: "/pages".into(),
                index: 2,
                value: json!("bad"),
            },
            Command::RemoveAt {
                parent: "/pages".into(),
                index: 1,
            },
            Command::RemoveAt {
                parent: "/meta".into(),
                index: 0,
            },
        ] {
            assert!(history.execute(&mut doc, command).is_err());
            assert_eq!(doc, before);
        }
        assert!(history.redo(&mut doc).unwrap());
        assert_eq!(doc["pages"], json!(["one", "two"]));
    }

    #[test]
    fn undo_restores_object_property_order_for_variable_mode_fallback() {
        let mut doc: Value =
            serde_json::from_str(r#"{"values":{"z-first":1,"a-second":2,"third":3}}"#).unwrap();
        let original = doc.to_string();
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Remove {
                    parent: "/values".into(),
                    key: "z-first".into(),
                },
            )
            .unwrap();
        assert!(history.undo(&mut doc).unwrap());
        assert_eq!(doc.to_string(), original);
        assert!(history.redo(&mut doc).unwrap());
        assert_eq!(doc.to_string(), r#"{"values":{"a-second":2,"third":3}}"#);
    }

    #[test]
    fn batch_reverses_dependent_edits_as_one_history_entry() {
        let original = json!({"layers":[{"name":"A"}],"meta":{"selection":null}});
        let mut doc = original.clone();
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Batch(vec![
                    Command::Insert {
                        parent: "/layers".into(),
                        index: 1,
                        value: json!({"name":"B"}),
                    },
                    Command::Set {
                        parent: "/layers/1".into(),
                        key: "name".into(),
                        value: json!("Renamed"),
                    },
                    Command::Set {
                        parent: "/meta".into(),
                        key: "selection".into(),
                        value: json!(1),
                    },
                ]),
            )
            .unwrap();
        let edited = doc.clone();
        assert_eq!(doc["layers"][1]["name"], "Renamed");
        assert!(history.undo(&mut doc).unwrap());
        assert_eq!(doc, original);
        assert!(!history.undo(&mut doc).unwrap());
        assert!(history.redo(&mut doc).unwrap());
        assert_eq!(doc, edited);
    }

    #[test]
    fn failed_batch_is_atomic_and_does_not_discard_redo() {
        let mut doc = json!({"layers":["A"]});
        let mut history = History::default();
        history
            .execute(
                &mut doc,
                Command::Insert {
                    parent: "/layers".into(),
                    index: 1,
                    value: json!("B"),
                },
            )
            .unwrap();
        assert!(history.undo(&mut doc).unwrap());
        let original = doc.clone();
        let result = history.execute(
            &mut doc,
            Command::Batch(vec![
                Command::Insert {
                    parent: "/layers".into(),
                    index: 1,
                    value: json!("C"),
                },
                Command::RemoveAt {
                    parent: "/layers".into(),
                    index: 99,
                },
            ]),
        );
        assert!(result.is_err());
        assert_eq!(doc, original);
        assert!(history.execute(&mut doc, Command::Batch(vec![])).is_err());
        assert!(history.redo(&mut doc).unwrap());
        assert_eq!(doc, json!({"layers":["A","B"]}));
    }

    #[test]
    fn project_history_validates_edits_and_keeps_revisions_monotonic_through_undo_redo() {
        let mut project = project_with_snapshot();
        let mut history = ProjectHistory::default();
        let command = Command::Set {
            parent: "/pages/0/nodes/root".into(),
            key: "name".into(),
            value: json!("Edited"),
        };

        history.execute(&mut project, command).unwrap();
        assert!(history.can_undo());
        assert!(!history.can_redo());
        assert_eq!(project.pages()[0].nodes["root"].name, "Edited");
        assert_eq!(project.revision(), 4);
        assert_eq!(
            project.legacy_snapshot(),
            Some(&json!({"source":"original"}))
        );
        assert!(!project.legacy_snapshot_is_current());

        assert!(history.undo(&mut project).unwrap());
        assert_eq!(project.pages()[0].nodes["root"].name, "Root");
        assert_eq!(project.revision(), 5);
        assert!(!project.legacy_snapshot_is_current());
        assert!(history.can_redo());

        assert!(history.redo(&mut project).unwrap());
        assert_eq!(project.pages()[0].nodes["root"].name, "Edited");
        assert_eq!(project.revision(), 6);
        assert!(!project.legacy_snapshot_is_current());
        assert!(!history.can_redo());
    }

    #[test]
    fn rejected_project_commands_do_not_change_scene_or_history() {
        let mut project = project_with_snapshot();
        let original = project.clone();
        let mut history = ProjectHistory::default();

        let metadata_edit = Command::Set {
            parent: "".into(),
            key: "name".into(),
            value: json!("Changed"),
        };
        assert!(history.execute(&mut project, metadata_edit).is_err());

        let invalid_scene_edit = Command::Set {
            parent: "/pages/0".into(),
            key: "root".into(),
            value: json!("missing-node"),
        };
        assert!(history.execute(&mut project, invalid_scene_edit).is_err());
        assert_eq!(project, original);
        assert!(!history.can_undo());
        assert!(!history.undo(&mut project).unwrap());
    }

    #[test]
    fn project_history_noop_does_not_create_an_entry_or_advance_revision() {
        let mut project = project_with_snapshot();
        let mut history = ProjectHistory::default();
        history
            .execute(
                &mut project,
                Command::Set {
                    parent: "/pages/0/nodes/root".into(),
                    key: "name".into(),
                    value: json!("Root"),
                },
            )
            .unwrap();

        assert_eq!(project.revision(), 3);
        assert!(project.legacy_snapshot_is_current());
        assert!(!history.can_undo());
    }

    #[test]
    fn typed_transform_command_uses_stable_ids_and_round_trips_through_history() {
        let mut project = project_with_snapshot();
        let node_id = "layer/one~two";
        project.pages[0].nodes.insert(
            node_id.into(),
            Node {
                name: "Layer".into(),
                kind: NodeKind::Rectangle,
                transform: Affine::default(),
                size: Size {
                    width: 12.0,
                    height: 8.0,
                    extras: BTreeMap::new(),
                },
                visible: true,
                locked: false,
                children: vec![],
                extras: BTreeMap::new(),
            },
        );
        project.pages[0]
            .nodes
            .get_mut("root")
            .unwrap()
            .children
            .push(node_id.into());
        let mut history = ProjectHistory::default();
        let moved = Affine {
            e: 24.0,
            f: -9.0,
            ..Affine::default()
        };

        history
            .set_node_transform(&mut project, "page", node_id, moved.clone())
            .unwrap();
        assert_eq!(project.pages()[0].nodes[node_id].transform, moved);
        assert_eq!(project.revision(), 4);

        assert!(history.undo(&mut project).unwrap());
        assert_eq!(
            project.pages()[0].nodes[node_id].transform,
            Affine::default()
        );
        assert_eq!(project.revision(), 5);
        assert!(history.redo(&mut project).unwrap());
        assert_eq!(project.pages()[0].nodes[node_id].transform.e, 24.0);
        assert_eq!(project.revision(), 6);
    }

    #[test]
    fn typed_transform_command_rejects_missing_ids_and_non_finite_geometry() {
        let mut project = project_with_snapshot();
        let original = project.clone();
        let mut history = ProjectHistory::default();

        assert!(history
            .set_node_transform(&mut project, "missing-page", "root", Affine::default())
            .is_err());
        assert!(history
            .set_node_transform(&mut project, "page", "missing-node", Affine::default())
            .is_err());
        assert!(history
            .set_node_transform(
                &mut project,
                "page",
                "root",
                Affine {
                    e: f64::NAN,
                    ..Affine::default()
                },
            )
            .is_err());
        assert_eq!(project, original);
        assert!(!history.can_undo());
    }
}
