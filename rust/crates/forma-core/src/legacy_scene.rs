use crate::{Affine, LegacyProject, Node, NodeKind, Page, Project, Size};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fmt;

/// A partial projection and the properties that still require conversion.
#[derive(Debug)]
pub struct ConversionReport {
    pub project: Project,
    pub warnings: Vec<String>,
}

/// A legacy page could not be safely projected into the initial scene model.
#[derive(Debug, PartialEq, Eq)]
pub struct LegacyConversionError(pub String);
impl fmt::Display for LegacyConversionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for LegacyConversionError {}

fn number(style: &Value, key: &str, path: &str) -> Result<f64, LegacyConversionError> {
    let Some(value) = style.get(key) else {
        return Ok(0.0);
    };
    let parsed = value.as_f64().or_else(|| {
        value.as_str().and_then(|text| {
            let trimmed = text.trim();
            let numeric = trimmed.strip_suffix("px").unwrap_or(trimmed);
            numeric.parse::<f64>().ok()
        })
    });
    parsed
        .filter(|v| v.is_finite())
        .ok_or_else(|| LegacyConversionError(format!("{path}: unsupported {key} geometry")))
}

fn convert_node(
    value: &Value,
    path: &str,
    nodes: &mut BTreeMap<String, Node>,
    warnings: &mut Vec<String>,
    depth: usize,
) -> Result<String, LegacyConversionError> {
    if depth > 512 {
        return Err(LegacyConversionError(format!(
            "{path}: component nesting exceeds 512"
        )));
    }
    let object = value
        .as_object()
        .ok_or_else(|| LegacyConversionError(format!("{path}: component must be an object")))?;
    let id = object
        .get("formaNodeId")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("legacy-{path}"));
    if nodes.contains_key(&id) {
        return Err(LegacyConversionError(format!(
            "{path}: duplicate node ID {id}"
        )));
    }
    let kind_text = object
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("default");
    let kind = match kind_text {
        "wrapper" | "default" => NodeKind::Group,
        "text" | "textnode" => NodeKind::Text,
        "image" => NodeKind::Image,
        "svg" | "svg-in" => NodeKind::Vector,
        other => {
            warnings.push(format!(
                "{path}: unsupported node kind {other}; source retained"
            ));
            NodeKind::Unknown(other.into())
        }
    };
    let style = object.get("style").unwrap_or(&Value::Null);
    if !style.is_null() && !style.is_object() {
        return Err(LegacyConversionError(format!(
            "{path}: style must be an object"
        )));
    }
    if style
        .get("transform")
        .is_some_and(|v| v.as_str() != Some("none"))
    {
        return Err(LegacyConversionError(format!(
            "{path}: CSS transforms require a dedicated adapter"
        )));
    }
    if style
        .get("position")
        .is_some_and(|v| !matches!(v.as_str(), Some("absolute" | "static")))
    {
        return Err(LegacyConversionError(format!(
            "{path}: layout positioning requires a dedicated adapter"
        )));
    }
    let x = number(style, "left", path)?;
    let y = number(style, "top", path)?;
    let width = number(style, "width", path)?;
    let height = number(style, "height", path)?;
    if style.get("width").is_none() || style.get("height").is_none() {
        warnings.push(format!(
            "{path}: missing dimensions represented as zero; source retained"
        ));
    }
    if style.as_object().is_some_and(|items| {
        items.keys().any(|key| {
            !["position", "left", "top", "width", "height", "transform"].contains(&key.as_str())
        })
    }) {
        warnings.push(format!(
            "{path}: visual styles not yet converted; source retained"
        ));
    }
    let mut node = Node {
        name: object
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(kind_text)
            .into(),
        kind,
        transform: Affine {
            e: x,
            f: y,
            ..Default::default()
        },
        size: Size {
            width,
            height,
            extras: BTreeMap::new(),
        },
        visible: style.get("display").and_then(Value::as_str) != Some("none"),
        locked: object
            .get("locked")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        children: vec![],
        extras: BTreeMap::from([("legacy_path".into(), json!(path))]),
    };
    if let Some(content) = object.get("content") {
        node.extras.insert("legacy_content".into(), content.clone());
    }
    nodes.insert(id.clone(), node);
    let children = match object.get("components") {
        None | Some(Value::Null) => &[][..],
        Some(Value::Array(items)) => items.as_slice(),
        _ => {
            return Err(LegacyConversionError(format!(
                "{path}: components must be an array"
            )))
        }
    };
    let mut child_ids = Vec::new();
    for (index, child) in children.iter().enumerate() {
        child_ids.push(convert_node(
            child,
            &format!("{path}-{index}"),
            nodes,
            warnings,
            depth + 1,
        )?);
    }
    nodes.get_mut(&id).expect("inserted node").children = child_ids;
    Ok(id)
}

impl LegacyProject {
    /// Projects simple legacy page trees while retaining the full original JSON.
    /// Unsupported geometry is rejected; omitted styling is listed in warnings.
    pub fn project_simple_pages(
        &self,
        fallback_id: &str,
    ) -> Result<ConversionReport, LegacyConversionError> {
        let source = self.clone().into_json();
        let pages = self
            .editor()
            .get("pages")
            .and_then(Value::as_array)
            .ok_or_else(|| LegacyConversionError("Missing pages".into()))?;
        let mut converted = Vec::new();
        let mut warnings = vec!["Partial projection: styles, CSS rules, layout and editor metadata require further conversion; original project retained".to_owned()];
        for (index, page) in pages.iter().enumerate() {
            let page_id = page
                .get("id")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| format!("page-{index}"));
            let component = if let Some(frames) = page.get("frames") {
                let frames = frames.as_array().ok_or_else(|| {
                    LegacyConversionError(format!("page {page_id}: frames must be an array"))
                })?;
                if frames.len() != 1 {
                    return Err(LegacyConversionError(format!(
                        "page {page_id}: exactly one frame is supported"
                    )));
                }
                frames[0].get("component")
            } else {
                page.get("component")
            };
            let component = component.ok_or_else(|| {
                LegacyConversionError(format!("page {page_id}: missing root component"))
            })?;
            let mut nodes = BTreeMap::new();
            let root = convert_node(component, &format!("{index}"), &mut nodes, &mut warnings, 0)?;
            converted.push(Page {
                id: page_id.clone(),
                name: page
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(&page_id)
                    .into(),
                root,
                nodes,
                extras: BTreeMap::new(),
            });
        }
        let project = Project {
            id: source
                .get("id")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .unwrap_or(fallback_id)
                .into(),
            name: source
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Untitled project")
                .into(),
            revision: source.get("revision").and_then(Value::as_u64).unwrap_or(0),
            pages: converted,
            legacy: Some(source),
            extras: BTreeMap::new(),
        };
        project
            .validate()
            .map_err(|error| LegacyConversionError(error.to_string()))?;
        Ok(ConversionReport { project, warnings })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projects_synthetic_fixtures_and_retains_original_json() {
        for fixture in [
            include_str!("../../../../fixtures/projects/legacy-pages.json"),
            include_str!("../../../../fixtures/projects/legacy-data.json"),
            include_str!("../../../../fixtures/projects/forma-v3.json"),
        ] {
            let source: Value = serde_json::from_str(fixture).unwrap();
            let report = LegacyProject::from_json(source.clone())
                .unwrap()
                .project_simple_pages("fallback")
                .unwrap();
            assert_eq!(report.project.pages.len(), 1);
            assert_eq!(report.project.legacy, Some(source));
            assert!(!report.warnings.is_empty());
            assert!(report.project.validate().is_ok());
        }
    }
    #[test]
    fn converts_simple_geometry_and_rejects_unsupported_layout() {
        let source = json!({"name":"Example","pages":[{"id":"p","component":{"type":"wrapper","style":{"width":"100px","height":"80px"},"components":[{"type":"text","content":"Hello","style":{"position":"absolute","left":"4px","top":"5px","width":"20px","height":"10px"}}]}}]});
        let legacy = LegacyProject::from_json(source.clone()).unwrap();
        let result = legacy.project_simple_pages("id").unwrap();
        let page = &result.project.pages[0];
        let child = &page.nodes[&page.nodes[&page.root].children[0]];
        assert_eq!(
            (child.transform.e, child.transform.f, child.size.width),
            (4.0, 5.0, 20.0)
        );
        assert_eq!(child.extras["legacy_content"], "Hello");
        let mut unsupported = source;
        unsupported["pages"][0]["component"]["components"][0]["style"]["width"] = json!("50%");
        assert!(LegacyProject::from_json(unsupported)
            .unwrap()
            .project_simple_pages("id")
            .unwrap_err()
            .to_string()
            .contains("unsupported width"));
    }
}
