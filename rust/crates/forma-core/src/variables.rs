use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// The declared type of a design variable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VariableKind {
    Color,
    Number,
    String,
    Boolean,
}

/// A literal or a reference to another variable.
#[derive(Debug, Clone, PartialEq)]
pub enum VariableValue {
    Color(String),
    Number(f64),
    String(String),
    Boolean(bool),
    Alias(String),
}

/// A variable with explicitly named modes in one collection.
#[derive(Debug, Clone, PartialEq)]
pub struct Variable {
    pub kind: VariableKind,
    pub collection: String,
    /// Mode values in authored order; the first value is the legacy fallback.
    pub values: Vec<(String, VariableValue)>,
}

/// A collection of variables and the selected mode for each collection.
#[derive(Debug, Default, Clone)]
pub struct VariableSet {
    pub variables: BTreeMap<String, Variable>,
    pub modes: BTreeMap<String, String>,
}

/// An alias or mode could not be resolved.
#[derive(Debug, PartialEq, Eq)]
pub enum VariableError {
    MissingVariable(String),
    MissingMode(String),
    Cycle(String),
    TypeMismatch(String),
    InvalidLegacy(String),
}

impl fmt::Display for VariableError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for VariableError {}

impl VariableSet {
    /// Reads defined variables and collection modes from Forma's legacy variable state.
    ///
    /// Legacy `modes` entries outside `definitions` are not yet converted.
    /// The input JSON is borrowed and remains available to preserve all source data.
    pub fn from_legacy_definitions(state: &serde_json::Value) -> Result<Self, VariableError> {
        let definitions = match state.get("definitions") {
            None => return Ok(Self::default()),
            Some(value) => value.as_object().ok_or_else(|| {
                VariableError::InvalidLegacy("definitions must be an object".into())
            })?,
        };
        let mut result = Self::default();
        let fallback_mode = state.get("mode").and_then(serde_json::Value::as_str);
        let collections = state
            .get("collections")
            .and_then(serde_json::Value::as_object);
        for (name, definition) in definitions {
            let kind = match definition.get("type").and_then(serde_json::Value::as_str) {
                Some("COLOR") => VariableKind::Color,
                Some("NUMBER") => VariableKind::Number,
                Some("STRING") => VariableKind::String,
                Some("BOOLEAN") => VariableKind::Boolean,
                _ => {
                    return Err(VariableError::InvalidLegacy(format!(
                        "{name}: unsupported variable type"
                    )))
                }
            };
            let collection = definition
                .get("collectionId")
                .and_then(serde_json::Value::as_str)
                .filter(|value| !value.is_empty())
                .unwrap_or("legacy");
            let selected = collections
                .and_then(|items| items.get(collection))
                .and_then(|item| item.get("mode"))
                .and_then(serde_json::Value::as_str)
                .filter(|mode| !mode.is_empty())
                .or(fallback_mode);
            if let Some(mode) = selected {
                result.modes.insert(collection.into(), mode.into());
            }
            let values = definition
                .get("values")
                .and_then(serde_json::Value::as_object)
                .ok_or_else(|| {
                    VariableError::InvalidLegacy(format!("{name}: values must be an object"))
                })?;
            let mut keys: Vec<_> = values.keys().collect();
            // JavaScript enumerates array-index keys numerically before other keys.
            keys.sort_by_key(|key| {
                key.parse::<u32>()
                    .ok()
                    .filter(|n| *n != u32::MAX && n.to_string() == **key)
                    .map_or((1, 0), |n| (0, n))
            });
            let mut converted = Vec::with_capacity(values.len());
            for mode in keys {
                let value = &values[mode];
                let alias = value
                    .as_object()
                    .and_then(|item| item.get("alias"))
                    .and_then(serde_json::Value::as_str)
                    .filter(|alias| !alias.is_empty())
                    .or_else(|| {
                        value
                            .as_str()
                            .and_then(|text| text.strip_prefix('@'))
                            .filter(|alias| !alias.is_empty())
                    });
                let converted_value = if let Some(alias) = alias {
                    VariableValue::Alias(alias.into())
                } else {
                    match kind {
                        VariableKind::Color => {
                            value.as_str().map(|v| VariableValue::Color(v.into()))
                        }
                        VariableKind::String => {
                            value.as_str().map(|v| VariableValue::String(v.into()))
                        }
                        VariableKind::Number => value
                            .as_f64()
                            .filter(|v| v.is_finite())
                            .map(VariableValue::Number),
                        VariableKind::Boolean => value.as_bool().map(VariableValue::Boolean),
                    }
                    .ok_or_else(|| {
                        VariableError::InvalidLegacy(format!("{name}:{mode}: unsupported value"))
                    })?
                };
                converted.push((mode.clone(), converted_value));
            }
            result.variables.insert(
                name.clone(),
                Variable {
                    kind,
                    collection: collection.into(),
                    values: converted,
                },
            );
        }
        Ok(result)
    }

    /// Resolves aliases using the selected or overridden mode of each collection.
    pub fn resolve<'a>(
        &'a self,
        name: &str,
        overrides: &BTreeMap<String, String>,
    ) -> Result<&'a VariableValue, VariableError> {
        let mut seen = BTreeSet::new();
        let mut current = name;
        let mut expected = None;
        loop {
            if !seen.insert(current.to_owned()) {
                return Err(VariableError::Cycle(current.to_owned()));
            }
            let variable = self
                .variables
                .get(current)
                .ok_or_else(|| VariableError::MissingVariable(current.to_owned()))?;
            if expected.is_some_and(|kind| kind != variable.kind) {
                return Err(VariableError::TypeMismatch(current.to_owned()));
            }
            expected = Some(variable.kind);
            let mode = overrides
                .get(&variable.collection)
                .filter(|mode| !mode.is_empty())
                .or_else(|| {
                    self.modes
                        .get(&variable.collection)
                        .filter(|mode| !mode.is_empty())
                });
            let value = mode
                .and_then(|mode| variable.values.iter().find(|(name, _)| name == mode))
                .or_else(|| variable.values.first())
                .map(|(_, value)| value)
                .ok_or_else(|| VariableError::MissingMode(variable.collection.clone()))?;
            match value {
                VariableValue::Alias(target) => current = target,
                literal => {
                    let valid = matches!(
                        (variable.kind, literal),
                        (VariableKind::Color, VariableValue::Color(_))
                            | (VariableKind::Number, VariableValue::Number(_))
                            | (VariableKind::String, VariableValue::String(_))
                            | (VariableKind::Boolean, VariableValue::Boolean(_))
                    );
                    if !valid || matches!(literal, VariableValue::Number(n) if !n.is_finite()) {
                        return Err(VariableError::TypeMismatch(current.to_owned()));
                    }
                    return Ok(literal);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn variable(
        kind: VariableKind,
        collection: &str,
        entries: &[(&str, VariableValue)],
    ) -> Variable {
        Variable {
            kind,
            collection: collection.into(),
            values: entries
                .iter()
                .map(|(mode, value)| ((*mode).into(), value.clone()))
                .collect(),
        }
    }
    #[test]
    fn resolves_aliases_across_collections_and_modes() {
        let mut set = VariableSet::default();
        set.modes.insert("theme".into(), "day".into());
        set.modes.insert("brand".into(), "light".into());
        set.variables.insert(
            "surface".into(),
            variable(
                VariableKind::Color,
                "theme",
                &[("day", VariableValue::Alias("brand-color".into()))],
            ),
        );
        set.variables.insert(
            "brand-color".into(),
            variable(
                VariableKind::Color,
                "brand",
                &[
                    ("light", VariableValue::Color("#fff".into())),
                    ("dark", VariableValue::Color("#000".into())),
                ],
            ),
        );
        assert_eq!(
            set.resolve("surface", &BTreeMap::new()),
            Ok(&VariableValue::Color("#fff".into()))
        );
        let overrides = BTreeMap::from([("brand".into(), "dark".into())]);
        assert_eq!(
            set.resolve("surface", &overrides),
            Ok(&VariableValue::Color("#000".into()))
        );
    }
    #[test]
    fn rejects_cycles_missing_values_and_type_mismatches() {
        let mut set = VariableSet::default();
        set.modes.insert("theme".into(), "day".into());
        set.variables.insert(
            "a".into(),
            variable(
                VariableKind::Number,
                "theme",
                &[("day", VariableValue::Alias("b".into()))],
            ),
        );
        set.variables.insert(
            "b".into(),
            variable(
                VariableKind::Number,
                "theme",
                &[("day", VariableValue::Alias("a".into()))],
            ),
        );
        assert!(matches!(
            set.resolve("a", &BTreeMap::new()),
            Err(VariableError::Cycle(_))
        ));
        set.variables.remove("b");
        assert!(matches!(
            set.resolve("a", &BTreeMap::new()),
            Err(VariableError::MissingVariable(_))
        ));
        set.variables.insert(
            "b".into(),
            variable(
                VariableKind::Boolean,
                "theme",
                &[("day", VariableValue::Boolean(true))],
            ),
        );
        assert!(matches!(
            set.resolve("a", &BTreeMap::new()),
            Err(VariableError::TypeMismatch(_))
        ));
        assert_eq!(
            set.resolve("b", &BTreeMap::from([("theme".into(), "night".into())])),
            Ok(&VariableValue::Boolean(true))
        );
        set.variables.get_mut("b").unwrap().values.clear();
        assert!(matches!(
            set.resolve("b", &BTreeMap::new()),
            Err(VariableError::MissingMode(_))
        ));
    }

    #[test]
    fn missing_mode_uses_first_authored_value_not_alphabetical_order() {
        let mut set = VariableSet::default();
        set.variables.insert(
            "surface".into(),
            variable(
                VariableKind::Color,
                "theme",
                &[
                    ("z-first", VariableValue::Color("#f00".into())),
                    ("a-second", VariableValue::Color("#0f0".into())),
                ],
            ),
        );
        assert_eq!(
            set.resolve("surface", &BTreeMap::new()),
            Ok(&VariableValue::Color("#f00".into()))
        );
        set.modes.insert("theme".into(), "a-second".into());
        assert_eq!(
            set.resolve("surface", &BTreeMap::new()),
            Ok(&VariableValue::Color("#0f0".into()))
        );
        assert_eq!(
            set.resolve(
                "surface",
                &BTreeMap::from([("theme".into(), "missing".into())])
            ),
            Ok(&VariableValue::Color("#f00".into()))
        );
    }

    #[test]
    fn imports_defined_variables_and_preserves_legacy_mode_order() {
        let source = r##"{"mode":"missing","collections":{"theme":{"mode":"missing"}},"definitions":{"surface":{"type":"COLOR","collectionId":"theme","values":{"z-first":"#f00","a-second":"#0f0"}},"alias":{"type":"COLOR","collectionId":"theme","values":{"z-first":{"alias":"surface"}}},"gap":{"type":"NUMBER","collectionId":"theme","values":{"z-first":12}}}}"##;
        let input: serde_json::Value = serde_json::from_str(source).unwrap();
        let variables = VariableSet::from_legacy_definitions(&input).unwrap();
        assert_eq!(
            variables.resolve("surface", &BTreeMap::new()),
            Ok(&VariableValue::Color("#f00".into()))
        );
        assert_eq!(
            variables.resolve("alias", &BTreeMap::new()),
            Ok(&VariableValue::Color("#f00".into()))
        );
        assert_eq!(
            variables.resolve(
                "surface",
                &BTreeMap::from([("theme".into(), "a-second".into())])
            ),
            Ok(&VariableValue::Color("#0f0".into()))
        );
        assert_eq!(
            variables.resolve("gap", &BTreeMap::new()),
            Ok(&VariableValue::Number(12.0))
        );
        assert_eq!(input["definitions"]["surface"]["values"]["z-first"], "#f00");
    }

    #[test]
    fn reports_unsupported_legacy_values_and_respects_javascript_integer_key_order() {
        let invalid =
            serde_json::json!({"definitions":{"bad":{"type":"NUMBER","values":{"day":"12"}}}});
        assert!(matches!(
            VariableSet::from_legacy_definitions(&invalid),
            Err(VariableError::InvalidLegacy(_))
        ));
        let raw = r#"{"definitions":{"n":{"type":"NUMBER","values":{"9":9,"2":2,"z":1}}}}"#;
        let input: serde_json::Value = serde_json::from_str(raw).unwrap();
        let variables = VariableSet::from_legacy_definitions(&input).unwrap();
        assert_eq!(
            variables.resolve("n", &BTreeMap::new()),
            Ok(&VariableValue::Number(2.0))
        );
    }
}
