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

fn retain_frame_metadata(frame: &Value, root: &str, nodes: &mut BTreeMap<String, Node>) {
    if let Some(mut metadata) = frame.as_object().cloned() {
        metadata.shift_remove("component");
        if !metadata.is_empty() {
            nodes
                .get_mut(root)
                .expect("converted frame root")
                .extras
                .insert("legacy_frame".into(), Value::Object(metadata));
        }
    }
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
            let mut nodes = BTreeMap::new();
            let root = if let Some(frames) = page.get("frames") {
                let frames = frames.as_array().ok_or_else(|| {
                    LegacyConversionError(format!("page {page_id}: frames must be an array"))
                })?;
                if frames.is_empty() {
                    return Err(LegacyConversionError(format!(
                        "page {page_id}: at least one frame is required"
                    )));
                }
                if frames.len() == 1 {
                    let component = frames[0].get("component").ok_or_else(|| {
                        LegacyConversionError(format!("page {page_id}: missing root component"))
                    })?;
                    let root =
                        convert_node(component, &format!("{index}"), &mut nodes, &mut warnings, 0)?;
                    retain_frame_metadata(&frames[0], &root, &mut nodes);
                    root
                } else {
                    let mut children = Vec::new();
                    for (frame_index, frame) in frames.iter().enumerate() {
                        let component = frame.get("component").ok_or_else(|| {
                            LegacyConversionError(format!(
                                "page {page_id}: frame {frame_index} missing root component"
                            ))
                        })?;
                        let child = convert_node(
                            component,
                            &format!("{index}-frame-{frame_index}"),
                            &mut nodes,
                            &mut warnings,
                            0,
                        )?;
                        retain_frame_metadata(frame, &child, &mut nodes);
                        children.push(child);
                    }
                    let root_id = format!("legacy-{index}-frames-root");
                    if nodes.contains_key(&root_id) {
                        return Err(LegacyConversionError(format!(
                            "page {page_id}: generated root ID collides with source node {root_id}"
                        )));
                    }
                    nodes.insert(
                        root_id.clone(),
                        Node {
                            name: "Page frame container".into(),
                            kind: NodeKind::Group,
                            transform: Affine::default(),
                            size: Size {
                                width: 0.0,
                                height: 0.0,
                                extras: BTreeMap::new(),
                            },
                            visible: true,
                            locked: false,
                            children,
                            extras: BTreeMap::from([(
                                "synthetic_frame_container".into(),
                                json!(true),
                            )]),
                        },
                    );
                    warnings.push(format!("page {page_id}: multiple frames use a synthetic zero-sized root; frame metadata needs further conversion"));
                    root_id
                }
            } else {
                let component = page.get("component").ok_or_else(|| {
                    LegacyConversionError(format!("page {page_id}: missing root component"))
                })?;
                convert_node(component, &format!("{index}"), &mut nodes, &mut warnings, 0)?
            };
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

    #[test]
    fn projects_multiple_frames_in_order_and_retains_source() {
        let source = json!({"id":"design","pages":[{"id":"page","frames":[
            {"id":"frame-a","custom":{"scale":2},"component":{"formaNodeId":"first","name":"First","type":"wrapper","style":{"width":"100px","height":"80px"}}},
            {"id":"frame-b","component":{"formaNodeId":"second","name":"Second","type":"wrapper","style":{"left":"120px","width":"60px","height":"40px"}}}
        ]}]});
        let report = LegacyProject::from_json(source.clone())
            .unwrap()
            .project_simple_pages("fallback")
            .unwrap();
        let page = &report.project.pages[0];
        assert_eq!(page.nodes[&page.root].children, ["first", "second"]);
        assert_eq!(page.nodes["second"].transform.e, 120.0);
        assert_eq!(
            page.nodes["first"].extras["legacy_frame"],
            json!({"id":"frame-a","custom":{"scale":2}})
        );
        assert_eq!(page.nodes["second"].extras["legacy_frame"]["id"], "frame-b");
        assert_eq!(
            page.nodes[&page.root].extras["synthetic_frame_container"],
            true
        );
        assert!(report
            .warnings
            .iter()
            .any(|w| w.contains("synthetic zero-sized root")));
        assert_eq!(report.project.legacy, Some(source));
        assert!(report.project.validate().is_ok());
    }

    #[test]
    fn retains_single_frame_metadata_on_its_root() {
        let source = json!({"pages":[{"id":"page","frames":[{"id":"frame-a","custom":{"enabled":true},"component":{"type":"wrapper"}}]}]});
        let report = LegacyProject::from_json(source)
            .unwrap()
            .project_simple_pages("id")
            .unwrap();
        let page = &report.project.pages[0];
        assert_eq!(
            page.nodes[&page.root].extras["legacy_frame"],
            json!({"id":"frame-a","custom":{"enabled":true}})
        );
        let encoded = report.project.to_json().unwrap();
        let restored = Project::from_json(&encoded).unwrap();
        assert_eq!(
            restored.pages[0].nodes[&page.root].extras["legacy_frame"]["id"],
            "frame-a"
        );
    }

    #[test]
    fn rejects_empty_frames_missing_components_and_generated_id_collisions() {
        let base = json!({"pages":[{"id":"page","frames":[]}]});
        assert!(LegacyProject::from_json(base)
            .unwrap()
            .project_simple_pages("id")
            .unwrap_err()
            .to_string()
            .contains("at least one frame"));
        let missing =
            json!({"pages":[{"id":"page","frames":[{"component":{"type":"wrapper"}},{}]}]});
        assert!(LegacyProject::from_json(missing)
            .unwrap()
            .project_simple_pages("id")
            .unwrap_err()
            .to_string()
            .contains("frame 1 missing"));
        let collision = json!({"pages":[{"id":"page","frames":[{"component":{"type":"wrapper","formaNodeId":"legacy-0-frames-root"}},{"component":{"type":"wrapper"}}]}]});
        assert!(LegacyProject::from_json(collision)
            .unwrap()
            .project_simple_pages("id")
            .unwrap_err()
            .to_string()
            .contains("collides"));
    }
}
