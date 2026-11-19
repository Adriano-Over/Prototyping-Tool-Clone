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
}

impl fmt::Display for VariableError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for VariableError {}

impl VariableSet {
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
}
