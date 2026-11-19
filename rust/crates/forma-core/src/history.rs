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
#[derive(Debug, Default)]
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
