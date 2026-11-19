use crate::{Affine, LegacyProject, Node, NodeKind, Page, Project, Size};
use serde_json::{json, Map, Value};
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

const CONVERSION_VIEWPORT_WIDTH: f64 = 1400.0;

fn media_query_applies(query: &str, viewport_width: f64) -> Option<bool> {
    let query = query.trim().to_ascii_lowercase();
    let query = query.strip_prefix('(')?.strip_suffix(')')?;
    let (feature, value) = query.split_once(':')?;
    let width = value
        .trim()
        .strip_suffix("px")?
        .trim()
        .parse::<f64>()
        .ok()?;
    if !width.is_finite() {
        return None;
    }
    match feature.trim() {
        "max-width" => Some(viewport_width <= width),
        "min-width" => Some(viewport_width >= width),
        _ => None,
    }
}

fn effective_style(
    component: &Value,
    style_rules: &[Value],
    path: &str,
    warnings: &mut Vec<String>,
) -> Result<Value, LegacyConversionError> {
    let mut resolved = Map::new();
    let id = component
        .get("attributes")
        .and_then(|attributes| attributes.get("id"))
        .and_then(Value::as_str);
    if let Some(id) = id {
        let selector = format!("#{id}");
        for rule in style_rules {
            let matches_id =
                rule.get("selectors")
                    .and_then(Value::as_array)
                    .is_some_and(|selectors| {
                        selectors
                            .iter()
                            .any(|item| item.as_str() == Some(&selector))
                    });
            if !matches_id {
                continue;
            }
            if let Some(media) = rule.get("mediaText").and_then(Value::as_str) {
                match media_query_applies(media, CONVERSION_VIEWPORT_WIDTH) {
                    Some(true) => {}
                    Some(false) => continue,
                    None => {
                        warnings.push(format!(
                            "{path}: unsupported CSS media query {media}; rule skipped"
                        ));
                        continue;
                    }
                }
            }
            let declarations = rule
                .get("style")
                .and_then(Value::as_object)
                .ok_or_else(|| {
                    LegacyConversionError(format!(
                        "{path}: matching CSS rule style must be an object"
                    ))
                })?;
            resolved.extend(
                declarations
                    .iter()
                    .map(|(key, value)| (key.clone(), value.clone())),
            );
        }
    } else if component
        .get("classes")
        .and_then(Value::as_array)
        .is_some_and(|classes| !classes.is_empty())
    {
        warnings.push(format!(
            "{path}: class-based CSS rules are not converted; source retained"
        ));
    }
    if let Some(inline) = component.get("style").filter(|value| !value.is_null()) {
        let inline = inline
            .as_object()
            .ok_or_else(|| LegacyConversionError(format!("{path}: style must be an object")))?;
        resolved.extend(
            inline
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
    }
    Ok(Value::Object(resolved))
}

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

fn origin_component(
    token: &str,
    extent: f64,
    horizontal: bool,
    path: &str,
) -> Result<f64, LegacyConversionError> {
    let token = token.trim().to_ascii_lowercase();
    let parsed = match token.as_str() {
        "center" => Some(extent / 2.0),
        "left" if horizontal => Some(0.0),
        "right" if horizontal => Some(extent),
        "top" if !horizontal => Some(0.0),
        "bottom" if !horizontal => Some(extent),
        _ if token.ends_with('%') => token[..token.len() - 1]
            .parse::<f64>()
            .ok()
            .map(|percent| extent * percent / 100.0),
        _ => token
            .strip_suffix("px")
            .unwrap_or(&token)
            .parse::<f64>()
            .ok(),
    };
    parsed
        .filter(|value| value.is_finite())
        .ok_or_else(|| LegacyConversionError(format!("{path}: unsupported transform-origin")))
}

fn transform_origin(
    style: &Value,
    width: f64,
    height: f64,
    path: &str,
) -> Result<(f64, f64), LegacyConversionError> {
    let Some(value) = style.get("transform-origin") else {
        return Ok((width / 2.0, height / 2.0));
    };
    let text = value
        .as_str()
        .ok_or_else(|| LegacyConversionError(format!("{path}: unsupported transform-origin")))?;
    let mut parts = text
        .split_whitespace()
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>();
    if parts.len() == 1 {
        if parts[0] == "center" {
            parts.push("center".into());
        } else if matches!(parts[0].as_str(), "top" | "bottom") {
            parts.insert(0, "center".into());
        } else if matches!(parts[0].as_str(), "left" | "right") {
            parts.push("center".into());
        } else {
            parts.insert(0, "center".into());
        }
    }
    if parts.len() == 3 && matches!(parts[2].as_str(), "0" | "0px") {
        parts.pop();
    }
    if parts.len() != 2 {
        return Err(LegacyConversionError(format!(
            "{path}: unsupported transform-origin"
        )));
    }
    let (x_token, y_token) = match (parts[0].as_str(), parts[1].as_str()) {
        ("top" | "bottom", "top" | "bottom") => {
            return Err(LegacyConversionError(format!(
                "{path}: unsupported transform-origin"
            )))
        }
        ("top" | "bottom", _) => (parts[1].as_str(), parts[0].as_str()),
        _ => (parts[0].as_str(), parts[1].as_str()),
    };
    Ok((
        origin_component(x_token, width, true, path)?,
        origin_component(y_token, height, false, path)?,
    ))
}

fn transform_error(path: &str, detail: &str) -> LegacyConversionError {
    LegacyConversionError(format!("{path}: {detail}"))
}

fn transform_arguments<'a>(
    text: &'a str,
    path: &str,
) -> Result<Vec<&'a str>, LegacyConversionError> {
    let parts = if text.contains(',') {
        text.split(',').map(str::trim).collect::<Vec<_>>()
    } else {
        text.split_whitespace().collect::<Vec<_>>()
    };
    if parts.is_empty() || parts.iter().any(|part| part.is_empty()) {
        return Err(transform_error(path, "invalid CSS transform arguments"));
    }
    Ok(parts)
}

fn transform_number(text: &str, path: &str) -> Result<f64, LegacyConversionError> {
    text.parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
        .ok_or_else(|| transform_error(path, "invalid CSS transform number"))
}

fn transform_length(text: &str, basis: f64, path: &str) -> Result<f64, LegacyConversionError> {
    let text = text.trim();
    if let Some(percent) = text.strip_suffix('%') {
        return Ok(transform_number(percent, path)? * basis / 100.0);
    }
    if let Some(pixels) = text.strip_suffix("px") {
        return transform_number(pixels.trim(), path);
    }
    if text == "0" {
        return Ok(0.0);
    }
    Err(transform_error(
        path,
        "unsupported CSS transform length unit",
    ))
}

fn transform_angle(text: &str, path: &str) -> Result<f64, LegacyConversionError> {
    let text = text.trim();
    let (number, factor) = if let Some(value) = text.strip_suffix("deg") {
        (value, std::f64::consts::PI / 180.0)
    } else if let Some(value) = text.strip_suffix("rad") {
        (value, 1.0)
    } else if let Some(value) = text.strip_suffix("turn") {
        (value, std::f64::consts::TAU)
    } else if let Some(value) = text.strip_suffix("grad") {
        (value, std::f64::consts::PI / 200.0)
    } else if text == "0" {
        return Ok(0.0);
    } else {
        return Err(transform_error(path, "unsupported CSS transform angle"));
    };
    let angle = transform_number(number.trim(), path)? * factor;
    if angle.is_finite() {
        Ok(angle)
    } else {
        Err(transform_error(path, "invalid CSS transform angle"))
    }
}

fn multiply_transform(left: &Affine, right: &Affine) -> Affine {
    Affine {
        a: left.a * right.a + left.c * right.b,
        b: left.b * right.a + left.d * right.b,
        c: left.a * right.c + left.c * right.d,
        d: left.b * right.c + left.d * right.d,
        e: left.a * right.e + left.c * right.f + left.e,
        f: left.b * right.e + left.d * right.f + left.f,
        ..Default::default()
    }
}

fn transform_function(
    name: &str,
    arguments: &str,
    width: f64,
    height: f64,
    path: &str,
) -> Result<Affine, LegacyConversionError> {
    let args = transform_arguments(arguments, path)?;
    let matrix = |a, b, c, d, e, f| Affine {
        a,
        b,
        c,
        d,
        e,
        f,
        ..Default::default()
    };
    match name.to_ascii_lowercase().as_str() {
        "matrix" => {
            let values = args
                .iter()
                .map(|value| transform_number(value, path))
                .collect::<Result<Vec<_>, _>>()?;
            if values.len() != 6 {
                return Err(transform_error(path, "invalid CSS matrix"));
            }
            let [a, b, c, d, e, f] = values.as_slice() else {
                unreachable!("matrix length validated")
            };
            Ok(matrix(*a, *b, *c, *d, *e, *f))
        }
        "translate" | "translatex" | "translatey" => {
            let (x, y) = match (name.to_ascii_lowercase().as_str(), args.as_slice()) {
                ("translate", [x]) => (transform_length(x, width, path)?, 0.0),
                ("translate", [x, y]) => (
                    transform_length(x, width, path)?,
                    transform_length(y, height, path)?,
                ),
                ("translatex", [x]) => (transform_length(x, width, path)?, 0.0),
                ("translatey", [y]) => (0.0, transform_length(y, height, path)?),
                _ => return Err(transform_error(path, "invalid CSS translate() arguments")),
            };
            Ok(matrix(1.0, 0.0, 0.0, 1.0, x, y))
        }
        "scale" | "scalex" | "scaley" => {
            let (x, y) = match (name.to_ascii_lowercase().as_str(), args.as_slice()) {
                ("scale", [scale]) => {
                    let value = transform_number(scale, path)?;
                    (value, value)
                }
                ("scale", [x, y]) => (transform_number(x, path)?, transform_number(y, path)?),
                ("scalex", [x]) => (transform_number(x, path)?, 1.0),
                ("scaley", [y]) => (1.0, transform_number(y, path)?),
                _ => return Err(transform_error(path, "invalid CSS scale() arguments")),
            };
            Ok(matrix(x, 0.0, 0.0, y, 0.0, 0.0))
        }
        "rotate" => {
            if args.len() != 1 {
                return Err(transform_error(path, "invalid CSS rotate() arguments"));
            }
            let angle = transform_angle(args[0], path)?;
            let (sin, cos) = angle.sin_cos();
            Ok(matrix(cos, sin, -sin, cos, 0.0, 0.0))
        }
        "skewx" | "skewy" | "skew" => {
            let (x, y) = match (name.to_ascii_lowercase().as_str(), args.as_slice()) {
                ("skewx", [x]) => (transform_angle(x, path)?, 0.0),
                ("skewy", [y]) => (0.0, transform_angle(y, path)?),
                ("skew", [x]) => (transform_angle(x, path)?, 0.0),
                ("skew", [x, y]) => (transform_angle(x, path)?, transform_angle(y, path)?),
                _ => return Err(transform_error(path, "invalid CSS skew() arguments")),
            };
            let tx = x.tan();
            let ty = y.tan();
            if !tx.is_finite() || !ty.is_finite() {
                return Err(transform_error(path, "invalid CSS skew angle"));
            }
            Ok(matrix(1.0, ty, tx, 1.0, 0.0, 0.0))
        }
        _ => Err(transform_error(path, "unsupported CSS transform function")),
    }
}

fn transform_list(
    text: &str,
    width: f64,
    height: f64,
    path: &str,
) -> Result<Affine, LegacyConversionError> {
    let mut rest = text.trim();
    let mut result = Affine::default();
    while !rest.is_empty() {
        let open = rest
            .find('(')
            .ok_or_else(|| transform_error(path, "invalid CSS transform list"))?;
        let name = rest[..open].trim();
        if name.is_empty() || name.chars().any(char::is_whitespace) {
            return Err(transform_error(path, "invalid CSS transform function"));
        }
        let body = &rest[open + 1..];
        let close = body
            .find(')')
            .ok_or_else(|| transform_error(path, "unterminated CSS transform function"))?;
        if body[..close].contains('(') {
            return Err(transform_error(
                path,
                "nested CSS transform functions are unsupported",
            ));
        }
        let next = transform_function(name, &body[..close], width, height, path)?;
        result = multiply_transform(&result, &next);
        rest = body[close + 1..].trim_start();
    }
    Ok(result)
}

fn css_transform(
    style: &Value,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    path: &str,
) -> Result<Affine, LegacyConversionError> {
    let Some(value) = style.get("transform") else {
        return Ok(Affine {
            e: x,
            f: y,
            ..Default::default()
        });
    };
    let text = value
        .as_str()
        .ok_or_else(|| transform_error(path, "unsupported CSS transform"))?;
    if text.trim() == "none" {
        return Ok(Affine {
            e: x,
            f: y,
            ..Default::default()
        });
    }
    let transform = transform_list(text, width, height, path)?;
    let (ox, oy) = transform_origin(style, width, height, path)?;
    let (a, b, c, d) = (transform.a, transform.b, transform.c, transform.d);
    let (tx, ty) = (transform.e, transform.f);
    let result = Affine {
        a,
        b,
        c,
        d,
        e: x + ox - a * ox - c * oy + tx,
        f: y + oy - b * ox - d * oy + ty,
        ..Default::default()
    };
    if [result.a, result.b, result.c, result.d, result.e, result.f]
        .iter()
        .all(|value| value.is_finite())
    {
        Ok(result)
    } else {
        Err(transform_error(path, "CSS transform result is not finite"))
    }
}

fn css_dimension(
    style: &Value,
    key: &str,
    path: &str,
) -> Result<Option<f64>, LegacyConversionError> {
    match style.get(key) {
        None => Ok(Some(0.0)),
        Some(Value::String(value)) if matches!(value.trim(), "auto" | "max-content") => Ok(None),
        Some(_) => number(style, key, path).map(Some),
    }
}

fn css_length(value: &Value, path: &str, property: &str) -> Result<f64, LegacyConversionError> {
    let parsed = value.as_f64().or_else(|| {
        value.as_str().and_then(|text| {
            let text = text.trim();
            text.strip_suffix("px")
                .unwrap_or(text)
                .trim()
                .parse::<f64>()
                .ok()
        })
    });
    parsed
        .filter(|value| value.is_finite() && *value >= 0.0)
        .ok_or_else(|| transform_error(path, &format!("unsupported {property} value")))
}

fn flex_gap(style: &Value, row: bool, path: &str) -> Result<f64, LegacyConversionError> {
    let specific = if row { "column-gap" } else { "row-gap" };
    let Some(value) = style.get(specific).or_else(|| style.get("gap")) else {
        return Ok(0.0);
    };
    if style.get(specific).is_none()
        && value
            .as_str()
            .is_some_and(|text| text.split_whitespace().count() == 2)
    {
        let parts = value
            .as_str()
            .unwrap()
            .split_whitespace()
            .collect::<Vec<_>>();
        let index = if row { 1 } else { 0 };
        return css_length(&Value::String(parts[index].into()), path, specific);
    }
    css_length(value, path, specific)
}

fn flex_padding(style: &Value, path: &str) -> Result<[f64; 4], LegacyConversionError> {
    let mut padding = [0.0; 4];
    if let Some(value) = style.get("padding") {
        let values = if let Some(text) = value.as_str() {
            text.split_whitespace()
                .map(|part| Value::String(part.to_owned()))
                .collect::<Vec<_>>()
        } else {
            vec![value.clone()]
        };
        let parsed = values
            .iter()
            .map(|value| css_length(value, path, "padding"))
            .collect::<Result<Vec<_>, _>>()?;
        match parsed.as_slice() {
            [all] => padding = [*all; 4],
            [vertical, horizontal] => padding = [*vertical, *horizontal, *vertical, *horizontal],
            [top, horizontal, bottom] => padding = [*top, *horizontal, *bottom, *horizontal],
            [top, right, bottom, left] => padding = [*top, *right, *bottom, *left],
            _ => return Err(transform_error(path, "invalid CSS padding shorthand")),
        }
    }
    for (index, side) in ["top", "right", "bottom", "left"].iter().enumerate() {
        if let Some(value) = style.get(format!("padding-{side}")) {
            padding[index] = css_length(value, path, "padding")?;
        }
    }
    Ok(padding)
}

fn flex_justify_offsets(
    justify: &str,
    free_space: f64,
    item_count: usize,
    gap: f64,
    path: &str,
) -> Result<(f64, f64), LegacyConversionError> {
    if free_space < -1e-8 {
        return Err(transform_error(
            path,
            "flex items exceed the container; shrinking is not supported",
        ));
    }
    let free = free_space.max(0.0);
    Ok(match justify {
        "flex-start" | "start" | "normal" => (0.0, gap),
        "flex-end" | "end" => (free, gap),
        "center" => (free / 2.0, gap),
        "space-between" if item_count > 1 => (0.0, gap + free / (item_count - 1) as f64),
        "space-around" if item_count > 0 => {
            let share = free / item_count as f64;
            (share / 2.0, gap + share)
        }
        "space-evenly" => {
            let share = free / (item_count + 1) as f64;
            (share, gap + share)
        }
        "space-between" => (0.0, gap),
        other => {
            return Err(transform_error(
                path,
                &format!("unsupported flex justify-content: {other}"),
            ));
        }
    })
}

#[allow(clippy::too_many_arguments)]
fn layout_flex_children(
    style: &Value,
    child_components: &[Value],
    child_ids: &[String],
    nodes: &mut BTreeMap<String, Node>,
    width: Option<f64>,
    height: Option<f64>,
    style_rules: &[Value],
    path: &str,
    warnings: &mut Vec<String>,
) -> Result<(f64, f64), LegacyConversionError> {
    let row = match style
        .get("flex-direction")
        .and_then(Value::as_str)
        .unwrap_or("row")
    {
        "row" => true,
        "column" => false,
        other => {
            return Err(transform_error(
                path,
                &format!("unsupported flex-direction: {other}"),
            ))
        }
    };
    if style
        .get("flex-wrap")
        .and_then(Value::as_str)
        .is_some_and(|wrap| wrap != "nowrap")
    {
        return Err(transform_error(
            path,
            "flex wrapping requires a dedicated adapter",
        ));
    }
    let padding = flex_padding(style, path)?;
    let main_gap = flex_gap(style, row, path)?;
    let (main_start_padding, main_end_padding, cross_start_padding, cross_end_padding) = if row {
        (padding[3], padding[1], padding[0], padding[2])
    } else {
        (padding[0], padding[2], padding[3], padding[1])
    };
    let mut items: Vec<(usize, f64, f64, f64, f64, bool, String)> = Vec::new();
    for (index, (component, id)) in child_components.iter().zip(child_ids).enumerate() {
        let child_style =
            effective_style(component, style_rules, &format!("{path}-{index}"), warnings)?;
        if child_style.get("position").and_then(Value::as_str) == Some("absolute") {
            continue;
        }
        let node = &nodes[id];
        let child_main_dimension = if row { "width" } else { "height" };
        let child_cross_dimension = if row { "height" } else { "width" };
        let child_main = css_dimension(&child_style, child_main_dimension, path)?;
        let child_cross = css_dimension(&child_style, child_cross_dimension, path)?;
        let basis = match child_style.get("flex-basis").and_then(Value::as_str) {
            None | Some("auto") => child_main.unwrap_or(if row {
                node.size.width
            } else {
                node.size.height
            }),
            Some(value) => css_length(&Value::String(value.into()), path, "flex-basis")?,
        };
        let grow = child_style
            .get("flex-grow")
            .map(|_| number(&child_style, "flex-grow", path))
            .transpose()?
            .unwrap_or(0.0);
        if grow < 0.0 {
            return Err(transform_error(path, "negative flex-grow is invalid"));
        }
        let cross = child_cross.unwrap_or(0.0);
        let cross_auto = child_cross.is_none();
        let align = child_style
            .get("align-self")
            .and_then(Value::as_str)
            .or_else(|| style.get("align-items").and_then(Value::as_str))
            .unwrap_or("stretch")
            .to_owned();
        items.push((
            index,
            basis,
            cross,
            grow,
            child_main.unwrap_or(-1.0),
            cross_auto,
            align,
        ));
    }
    let main_extent = if row { width } else { height };
    let total_gap = main_gap * items.len().saturating_sub(1) as f64;
    let main_content_extent =
        main_extent.map(|value| value - main_start_padding - main_end_padding);
    let bases = items.iter().map(|item| item.1).sum::<f64>();
    let intrinsic_main = bases + total_gap + main_start_padding + main_end_padding;
    let available_main = main_content_extent.unwrap_or(bases + total_gap);
    let mut free = available_main - bases - total_gap;
    if free < -1e-8 {
        return Err(transform_error(
            path,
            "flex items exceed the container; shrinking is not supported",
        ));
    }
    let grow_total = items.iter().map(|item| item.3).sum::<f64>();
    let mut main_sizes = items.iter().map(|item| item.1).collect::<Vec<_>>();
    if grow_total > 0.0 && main_extent.is_some() {
        for (size, item) in main_sizes.iter_mut().zip(&items) {
            *size += free.max(0.0) * item.3 / grow_total;
        }
        free = 0.0;
    }
    let intrinsic_cross = items.iter().map(|item| item.2).fold(0.0_f64, f64::max)
        + cross_start_padding
        + cross_end_padding;
    let final_width = width.unwrap_or(if row { intrinsic_main } else { intrinsic_cross });
    let final_height = height.unwrap_or(if row { intrinsic_cross } else { intrinsic_main });
    let cross_content_extent =
        (if row { final_height } else { final_width }) - cross_start_padding - cross_end_padding;
    let justify = style
        .get("justify-content")
        .and_then(Value::as_str)
        .unwrap_or("flex-start");
    let (mut cursor, distributed_gap) =
        flex_justify_offsets(justify, free, items.len(), main_gap, path)?;
    cursor += main_start_padding;
    for (item_index, item) in items.iter().enumerate() {
        let (child_index, _, cross_size, _, original_main, cross_auto, align) = item;
        let main_size = main_sizes[item_index];
        if *original_main < 0.0 && item.3 == 0.0 && item.1 == 0.0 {
            return Err(transform_error(
                path,
                "auto-sized flex item needs a size or positive flex-grow",
            ));
        }
        let mut child_cross_size = *cross_size;
        if *cross_auto && align == "stretch" {
            child_cross_size = cross_content_extent;
        }
        let cross_position = match align.as_str() {
            "flex-start" | "start" | "stretch" => cross_start_padding,
            "center" => cross_start_padding + (cross_content_extent - child_cross_size) / 2.0,
            "flex-end" | "end" => cross_start_padding + cross_content_extent - child_cross_size,
            other => {
                return Err(transform_error(
                    path,
                    &format!("unsupported flex align: {other}"),
                ))
            }
        };
        let id = &child_ids[*child_index];
        let child = nodes.get_mut(id).expect("converted flex child");
        if row {
            child.size.width = main_size;
            child.size.height = child_cross_size;
            child.transform.e += cursor;
            child.transform.f += cross_position;
        } else {
            child.size.height = main_size;
            child.size.width = child_cross_size;
            child.transform.e += cross_position;
            child.transform.f += cursor;
        }
        cursor += main_size + distributed_gap;
    }
    Ok((final_width, final_height))
}

fn convert_node(
    value: &Value,
    path: &str,
    style_rules: &[Value],
    in_flex_parent: bool,
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
    let style = effective_style(value, style_rules, path, warnings)?;
    if style
        .get("position")
        .is_some_and(|v| !matches!(v.as_str(), Some("absolute" | "relative" | "static")))
    {
        return Err(LegacyConversionError(format!(
            "{path}: layout positioning requires a dedicated adapter"
        )));
    }
    let position = style
        .get("position")
        .and_then(Value::as_str)
        .unwrap_or("static");
    let display = style.get("display").and_then(Value::as_str).unwrap_or("");
    let is_flex = matches!(display, "flex" | "inline-flex");
    if matches!(display, "grid" | "inline-grid") {
        return Err(LegacyConversionError(format!(
            "{path}: CSS grid layout requires a dedicated adapter"
        )));
    }
    if position == "relative"
        && ["left", "top"].iter().any(|key| {
            style
                .get(*key)
                .is_some_and(|value| value.as_str() != Some("auto"))
        })
    {
        return Err(LegacyConversionError(format!(
            "{path}: flow layout offsets require a dedicated adapter"
        )));
    }
    let x = if position != "absolute" && style.get("left").and_then(Value::as_str) == Some("auto") {
        0.0
    } else {
        number(&style, "left", path)?
    };
    let y = if position != "absolute" && style.get("top").and_then(Value::as_str) == Some("auto") {
        0.0
    } else {
        number(&style, "top", path)?
    };
    let width = css_dimension(&style, "width", path)?;
    let height = css_dimension(&style, "height", path)?;
    if !is_flex && !in_flex_parent && (width.is_none() || height.is_none()) {
        return Err(LegacyConversionError(format!(
            "{path}: intrinsic or auto sizing requires a layout adapter"
        )));
    }
    if style.get("width").is_none() || style.get("height").is_none() {
        warnings.push(format!(
            "{path}: missing dimensions represented as zero; source retained"
        ));
    }
    if style.as_object().is_some_and(|items| {
        items.keys().any(|key| {
            ![
                "position",
                "left",
                "top",
                "width",
                "height",
                "transform",
                "transform-origin",
                "display",
                "flex-direction",
                "flex-wrap",
                "flex-grow",
                "flex-shrink",
                "flex-basis",
                "gap",
                "row-gap",
                "column-gap",
                "padding",
                "padding-top",
                "padding-right",
                "padding-bottom",
                "padding-left",
                "align-items",
                "align-self",
                "justify-content",
            ]
            .contains(&key.as_str())
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
            width: width.unwrap_or(0.0),
            height: height.unwrap_or(0.0),
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
    if !is_flex {
        for (index, child) in children.iter().enumerate() {
            let child_style =
                effective_style(child, style_rules, &format!("{path}-{index}"), warnings)?;
            if child_style.get("position").and_then(Value::as_str) == Some("relative") {
                return Err(LegacyConversionError(format!(
                    "{path}-{index}: flow layout requires a dedicated adapter"
                )));
            }
        }
    }
    let mut child_ids = Vec::new();
    for (index, child) in children.iter().enumerate() {
        child_ids.push(convert_node(
            child,
            &format!("{path}-{index}"),
            style_rules,
            is_flex,
            nodes,
            warnings,
            depth + 1,
        )?);
    }
    nodes.get_mut(&id).expect("inserted node").children = child_ids;
    let (width, height) = if is_flex {
        let flex_child_ids = nodes[&id].children.clone();
        layout_flex_children(
            &style,
            children,
            &flex_child_ids,
            nodes,
            width,
            height,
            style_rules,
            path,
            warnings,
        )?
    } else {
        let width = width.unwrap_or(0.0);
        let height = height.unwrap_or(0.0);
        (width, height)
    };
    let node = nodes.get_mut(&id).expect("inserted node");
    node.size.width = width;
    node.size.height = height;
    node.transform = css_transform(&style, x, y, width, height, path)?;
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
        let style_rules = self
            .editor()
            .get("styles")
            .map(|styles| {
                styles
                    .as_array()
                    .ok_or_else(|| LegacyConversionError("CSS styles must be an array".into()))
            })
            .transpose()?
            .map(Vec::as_slice)
            .unwrap_or(&[]);
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
                    let root = convert_node(
                        component,
                        &format!("{index}"),
                        style_rules,
                        false,
                        &mut nodes,
                        &mut warnings,
                        0,
                    )?;
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
                            style_rules,
                            false,
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
                convert_node(
                    component,
                    &format!("{index}"),
                    style_rules,
                    false,
                    &mut nodes,
                    &mut warnings,
                    0,
                )?
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
        let revision = source.get("revision").and_then(Value::as_u64).unwrap_or(0);
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
            revision,
            pages: converted,
            legacy: Some(source),
            legacy_snapshot_revision: Some(revision),
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
    fn projects_real_import_geometry_from_css_rules_and_retains_the_source() {
        let source: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/projects/forma-real-css-rules.json"
        ))
        .unwrap();
        let report = LegacyProject::from_json(source.clone())
            .unwrap()
            .project_simple_pages("fallback")
            .unwrap();
        let page = &report.project.pages[0];
        assert!(report.project.legacy_snapshot_is_current());
        let frame = &page.nodes[&page.root];
        let section = &page.nodes[&frame.children[0]];
        assert_eq!((frame.size.width, frame.size.height), (1024.0, 3368.0));
        assert_eq!(
            (
                section.transform.e,
                section.transform.f,
                section.size.width,
                section.size.height
            ),
            (0.0, 1021.0, 750.0, 1000.0)
        );
        assert_eq!(report.project.legacy, Some(source));
        assert!(report.project.validate().is_ok());
    }

    #[test]
    fn lays_out_a_real_imported_flex_row_with_padding_gap_and_intrinsic_height() {
        let source: Value = serde_json::from_str(include_str!(
            "../../../../fixtures/projects/forma-real-flex.json"
        ))
        .unwrap();
        let report = LegacyProject::from_json(source)
            .unwrap()
            .project_simple_pages("fallback")
            .unwrap();
        let page = &report.project.pages[0];
        let frame = &page.nodes[&page.root];
        let flex = &page.nodes[&frame.children[0]];
        assert_eq!(
            (
                flex.transform.e,
                flex.transform.f,
                flex.size.width,
                flex.size.height
            ),
            (12.0, 72.0, 48.0, 32.0)
        );
        let first = &page.nodes[&flex.children[0]];
        let second = &page.nodes[&flex.children[1]];
        assert_eq!((first.transform.e, first.transform.f), (2.0, 0.0));
        assert_eq!((second.transform.e, second.transform.f), (40.0, 15.0));
    }

    #[test]
    fn cascades_matching_id_rules_at_the_default_viewport_before_inline_style() {
        let source = json!({
            "pages": [{"frames": [{"component": {
                "type": "wrapper",
                "attributes": {"id": "frame"},
                "components": [{
                    "type": "wrapper",
                    "attributes": {"id": "box"},
                    "style": {"left": "12px"}
                }]
            }}]}],
            "styles": [
                {"selectors": ["#frame"], "style": {"position": "absolute", "width": "100px", "height": "50px"}},
                {"selectors": ["#box"], "style": {"position": "absolute", "left": "7px", "top": "8px", "width": "20px", "height": "10px"}, "mediaText": "(max-width: 1400px)"},
                {"selectors": ["#box"], "style": {"left": "99px"}, "mediaText": "(max-width: 800px)"}
            ]
        });
        let report = LegacyProject::from_json(source)
            .unwrap()
            .project_simple_pages("id")
            .unwrap();
        let page = &report.project.pages[0];
        let box_node = &page.nodes[&page.nodes[&page.root].children[0]];
        assert_eq!(
            (
                box_node.transform.e,
                box_node.transform.f,
                box_node.size.width,
                box_node.size.height
            ),
            (12.0, 8.0, 20.0, 10.0)
        );
    }

    #[test]
    fn rejects_unsupported_grid_wrapping_and_shrinking_layouts() {
        for display in ["grid", "inline-grid"] {
            let source = json!({"pages":[{"component":{"type":"wrapper","style":{"position":"absolute","width":"100px","height":"50px","display":display},"components":[{"type":"wrapper","style":{"position":"relative","left":"auto","top":"auto","width":"20px","height":"10px"}}]}}]});
            assert!(LegacyProject::from_json(source)
                .unwrap()
                .project_simple_pages("id")
                .unwrap_err()
                .to_string()
                .contains("CSS grid layout requires"));
        }

        let wrapping = json!({"pages":[{"component":{"type":"wrapper","style":{"position":"absolute","width":"100px","height":"50px","display":"flex","flex-wrap":"wrap"},"components":[]}}]});
        assert!(LegacyProject::from_json(wrapping)
            .unwrap()
            .project_simple_pages("id")
            .unwrap_err()
            .to_string()
            .contains("flex wrapping requires"));

        let shrinking = json!({"pages":[{"component":{"type":"wrapper","style":{"position":"absolute","width":"30px","height":"50px","display":"flex","flex-direction":"row"},"components":[{"type":"wrapper","style":{"position":"relative","left":"auto","top":"auto","width":"20px","height":"10px"}},{"type":"wrapper","style":{"position":"relative","left":"auto","top":"auto","width":"20px","height":"10px"}}]}}]});
        assert!(LegacyProject::from_json(shrinking)
            .unwrap()
            .project_simple_pages("id")
            .unwrap_err()
            .to_string()
            .contains("flex items exceed the container"));
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
    fn converts_css_matrices_with_explicit_and_default_origins() {
        let source = json!({"pages":[{"component":{"type":"wrapper","style":{"width":"200px","height":"100px"},"components":[
            {"type":"wrapper","style":{"left":"38px","top":"35px","width":"80px","height":"40px","transform":"matrix(2, 0.5, 0.25, 3, 0, 0)","transform-origin":"0 0"}},
            {"type":"wrapper","style":{"left":10,"top":20,"width":16,"height":12,"transform":"matrix(0, 1, -1, 0, 0, 0)"}},
            {"type":"wrapper","style":{"left":2,"top":3,"width":40,"height":20,"transform":"matrix(2, 0, 0, 2, 0, 0)","transform-origin":"top 25%"}}
        ]}}]});
        let report = LegacyProject::from_json(source)
            .unwrap()
            .project_simple_pages("id")
            .unwrap();
        let page = &report.project.pages[0];
        let nodes = &page.nodes;
        let first = &nodes[&nodes[&page.root].children[0]];
        assert_eq!(
            (
                first.transform.a,
                first.transform.b,
                first.transform.c,
                first.transform.d,
                first.transform.e,
                first.transform.f
            ),
            (2.0, 0.5, 0.25, 3.0, 38.0, 35.0)
        );
        let second = &nodes[&nodes[&page.root].children[1]];
        assert_eq!(
            (
                second.transform.a,
                second.transform.b,
                second.transform.c,
                second.transform.d,
                second.transform.e,
                second.transform.f
            ),
            (0.0, 1.0, -1.0, 0.0, 24.0, 18.0)
        );
        let third = &nodes[&nodes[&page.root].children[2]];
        assert_eq!((third.transform.e, third.transform.f), (-8.0, 3.0));
    }

    #[test]
    fn converts_chained_rotation_scale_skew_and_translation_like_forma_emits() {
        let source = json!({"pages":[{"component":{"type":"wrapper","style":{"width":200,"height":100},"components":[
            {"type":"wrapper","style":{"left":10,"top":20,"width":16,"height":16,"transform":"translate(4px, 8px) scale(2, 3) skewX(45deg) rotate(90deg)","transform-origin":"0 0"}},
            {"type":"wrapper","style":{"left":2,"top":3,"width":10,"height":20,"transform":"rotate(90deg)"}},
            {"type":"wrapper","style":{"width":80,"height":40,"transform":"translate(50%, 25%) scaleX(2) scaleY(3)","transform-origin":"0 0"}}
        ]}}]});
        let report = LegacyProject::from_json(source)
            .unwrap()
            .project_simple_pages("id")
            .unwrap();
        let page = &report.project.pages[0];
        let nodes = &page.nodes;
        let chained = &nodes[&nodes[&page.root].children[0]];
        assert!((chained.transform.a - 2.0).abs() < 1e-12);
        assert!((chained.transform.b - 3.0).abs() < 1e-12);
        assert!((chained.transform.c + 2.0).abs() < 1e-12);
        assert!(chained.transform.d.abs() < 1e-12);
        assert_eq!((chained.transform.e, chained.transform.f), (14.0, 28.0));
        let rotated = &nodes[&nodes[&page.root].children[1]];
        assert!(rotated.transform.a.abs() < 1e-12);
        assert!((rotated.transform.b - 1.0).abs() < 1e-12);
        assert!((rotated.transform.c + 1.0).abs() < 1e-12);
        assert!(rotated.transform.d.abs() < 1e-12);
        assert!((rotated.transform.e - 17.0).abs() < 1e-12);
        assert!((rotated.transform.f - 8.0).abs() < 1e-12);
        let percentage = &nodes[&nodes[&page.root].children[2]];
        assert_eq!(
            (
                percentage.transform.a,
                percentage.transform.d,
                percentage.transform.e,
                percentage.transform.f
            ),
            (2.0, 3.0, 40.0, 10.0)
        );
    }

    #[test]
    fn rejects_unsupported_or_malformed_css_transforms_and_origins() {
        for (transform, origin) in [
            ("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)", "0 0"),
            ("matrix(1,0,0,1,NaN,0)", "0 0"),
            ("matrix(1,0,0,1,0)", "0 0"),
            ("translate3d(1px, 2px, 3px)", "0 0"),
            ("rotateX(35deg)", "0 0"),
            ("matrix(1,0,0,1,0,0)", "calc(50% - 2px) 0"),
        ] {
            let source = json!({"pages":[{"component":{"type":"wrapper","style":{"width":20,"height":10,"transform":transform,"transform-origin":origin}}}]});
            assert!(LegacyProject::from_json(source)
                .unwrap()
                .project_simple_pages("id")
                .is_err());
        }
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
