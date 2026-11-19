use serde_json::Value;
use std::fmt;

/// A reversible change to an object property in a project document.
#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    /// Set an object property; `parent` is a JSON pointer to its existing parent.
    Set {
        parent: String,
        key: String,
        value: Value,
    },
    /// Remove an existing object property.
    Remove { parent: String, key: String },
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
        let (parent, key) = match self {
            Command::Set { parent, key, .. } | Command::Remove { parent, key } => (parent, key),
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
                let value = object
                    .remove(key)
                    .ok_or(HistoryError("Property does not exist"))?;
                Ok(Command::Set {
                    parent: parent.clone(),
                    key: key.clone(),
                    value,
                })
            }
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
}
