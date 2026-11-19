use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

/// Two-dimensional affine transform: x' = a*x + c*y + e, y' = b*x + d*y + f.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Affine {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub e: f64,
    pub f: f64,
}

impl Default for Affine {
    fn default() -> Self {
        Self {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: 0.0,
            f: 0.0,
        }
    }
}

/// Untransformed node dimensions.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

/// Initial native scene node categories.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKind {
    Frame,
    Section,
    Slice,
    Rectangle,
    Ellipse,
    Group,
    Text,
    Image,
    Vector,
}

/// A scene node; child IDs are ordered from back to front.
#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub name: String,
    pub kind: NodeKind,
    pub transform: Affine,
    pub size: Size,
    pub visible: bool,
    pub locked: bool,
    pub children: Vec<String>,
}

/// A page stores a single rooted node tree keyed by stable IDs.
#[derive(Debug, Clone, PartialEq)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub root: String,
    pub nodes: BTreeMap<String, Node>,
}

/// A scene contains invalid geometry or hierarchy.
#[derive(Debug, PartialEq, Eq)]
pub enum SceneError {
    EmptyId,
    MissingNode(String),
    MultipleParents(String),
    Cycle(String),
    UnreachableNode(String),
    InvalidGeometry(String),
}
impl fmt::Display for SceneError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for SceneError {}

impl Page {
    /// Validates node references, geometry, cycles, and single-parent ownership.
    pub fn validate(&self) -> Result<(), SceneError> {
        if self.id.is_empty() || self.root.is_empty() || self.nodes.keys().any(String::is_empty) {
            return Err(SceneError::EmptyId);
        }
        let mut visited = BTreeSet::new();
        let mut active = BTreeSet::new();
        // Explicit stack avoids overflowing the call stack for deep imported documents.
        let mut stack = vec![(self.root.as_str(), false)];
        while let Some((id, exiting)) = stack.pop() {
            if exiting {
                active.remove(id);
                continue;
            }
            if active.contains(id) {
                return Err(SceneError::Cycle(id.into()));
            }
            if !visited.insert(id) {
                return Err(SceneError::MultipleParents(id.into()));
            }
            let node = self
                .nodes
                .get(id)
                .ok_or_else(|| SceneError::MissingNode(id.into()))?;
            let t = node.transform;
            if ![
                t.a,
                t.b,
                t.c,
                t.d,
                t.e,
                t.f,
                node.size.width,
                node.size.height,
            ]
            .iter()
            .all(|v| v.is_finite())
                || node.size.width < 0.0
                || node.size.height < 0.0
            {
                return Err(SceneError::InvalidGeometry(id.into()));
            }
            active.insert(id);
            stack.push((id, true));
            for child in node.children.iter().rev() {
                stack.push((child, false));
            }
        }
        if let Some(id) = self.nodes.keys().find(|id| !visited.contains(id.as_str())) {
            return Err(SceneError::UnreachableNode(id.clone()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn node(children: &[&str]) -> Node {
        Node {
            name: "Node".into(),
            kind: NodeKind::Frame,
            transform: Affine::default(),
            size: Size {
                width: 10.0,
                height: 10.0,
            },
            visible: true,
            locked: false,
            children: children.iter().map(|v| (*v).into()).collect(),
        }
    }
    fn page(nodes: &[(&str, Node)]) -> Page {
        Page {
            id: "page".into(),
            name: "Page".into(),
            root: "root".into(),
            nodes: nodes
                .iter()
                .map(|(id, node)| ((*id).into(), node.clone()))
                .collect(),
        }
    }
    #[test]
    fn accepts_ordered_tree_and_rejects_invalid_geometry() {
        let mut p = page(&[("root", node(&["child"])), ("child", node(&[]))]);
        assert_eq!(p.validate(), Ok(()));
        p.nodes.get_mut("child").unwrap().size.width = f64::NAN;
        assert_eq!(
            p.validate(),
            Err(SceneError::InvalidGeometry("child".into()))
        );
    }
    #[test]
    fn rejects_missing_cycles_multiple_parents_and_orphans() {
        assert_eq!(
            page(&[("root", node(&["absent"]))]).validate(),
            Err(SceneError::MissingNode("absent".into()))
        );
        assert_eq!(
            page(&[("root", node(&["child"])), ("child", node(&["root"]))]).validate(),
            Err(SceneError::Cycle("root".into()))
        );
        assert_eq!(
            page(&[("root", node(&["child", "child"])), ("child", node(&[]))]).validate(),
            Err(SceneError::MultipleParents("child".into()))
        );
        assert_eq!(
            page(&[("root", node(&[])), ("orphan", node(&[]))]).validate(),
            Err(SceneError::UnreachableNode("orphan".into()))
        );
    }
}
