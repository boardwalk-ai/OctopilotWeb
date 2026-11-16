//! PPTX -> scene graph. Resolves theme colors and fonts, the color map, and
//! placeholder inheritance (slide -> layout -> master -> master text styles).

use crate::model::*;
use roxmltree::{Document, Node};
use std::collections::HashMap;
use std::io::{Cursor, Read};

type Files = HashMap<String, Vec<u8>>;

// ── small XML helpers (match by local name; namespaces are not needed for our subset) ──
fn kids<'a>(n: Node<'a, 'a>, name: &'a str) -> impl Iterator<Item = Node<'a, 'a>> {
    n.children().filter(move |c| c.is_element() && c.tag_name().name() == name)
}
fn kid<'a>(n: Node<'a, 'a>, name: &'a str) -> Option<Node<'a, 'a>> {
    kids(n, name).next()
}
fn path<'a>(n: Node<'a, 'a>, names: &[&'a str]) -> Option<Node<'a, 'a>> {
    let mut cur = n;
    for name in names {
        cur = kid(cur, name)?;
    }
    Some(cur)
}
fn desc<'a>(n: Node<'a, 'a>, name: &'a str) -> Option<Node<'a, 'a>> {
    n.descendants().find(|c| c.is_element() && c.tag_name().name() == name)
}
fn attr_f(n: Node, name: &str) -> Option<f64> {
    n.attribute(name).and_then(|v| v.trim().parse::<f64>().ok())
}
fn attr_b(n: Node, name: &str) -> Option<bool> {
    n.attribute(name).map(|v| v == "1" || v == "true")
}

fn resolve(from: &str, target: &str) -> String {
    if let Some(abs) = target.strip_prefix('/') {
        return abs.to_string();
    }
    let mut parts: Vec<&str> = from.split('/').collect();
    parts.pop();
    for seg in target.split('/') {
        match seg {
            ".." => {
                parts.pop();
            }
            "." | "" => {}
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn text_of(files: &Files, name: &str) -> Option<String> {
    files.get(name).map(|b| String::from_utf8_lossy(b).into_owned())
}

/// rId -> (type suffix, resolved target)
fn rels_of(files: &Files, part: &str) -> HashMap<String, (String, String)> {
    let mut out = HashMap::new();
    let (dir, file) = match part.rfind('/') {
        Some(i) => (&part[..i], &part[i + 1..]),
        None => ("", part),
    };
    let rel_path = if dir.is_empty() { format!("_rels/{file}.rels") } else { format!("{dir}/_rels/{file}.rels") };
    if let Some(xml) = text_of(files, &rel_path) {
        if let Ok(doc) = Document::parse(&xml) {
            for r in doc.root_element().children().filter(|c| c.is_element()) {
                let ty = r.attribute("Type").unwrap_or("").rsplit('/').next().unwrap_or("").to_string();
                if let (Some(id), Some(t)) = (r.attribute("Id"), r.attribute("Target")) {
                    out.insert(id.to_string(), (ty, resolve(part, t)));
                }
            }
        }
    }
    out
}

// ── styles ───────────────────────────────────────────────────────────────────
#[derive(Clone, Debug, Default)]
struct RunStyle {
    size: Option<f64>,
    bold: Option<bool>,
    italic: Option<bool>,
    underline: Option<bool>,
    strike: Option<bool>,
    color: Option<Color>,
    font: Option<String>,
    spacing: Option<f64>,
    baseline: Option<f64>,
}

impl RunStyle {
    fn over(&self, c: &RunStyle) -> RunStyle {
        RunStyle {
            size: c.size.or(self.size),
            bold: c.bold.or(self.bold),
            italic: c.italic.or(self.italic),
            underline: c.underline.or(self.underline),
            strike: c.strike.or(self.strike),
            color: c.color.or(self.color),
            font: c.font.clone().or_else(|| self.font.clone()),
            spacing: c.spacing.or(self.spacing),
            baseline: c.baseline.or(self.baseline),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
enum BulletStyle {
    None,
    Char(String),
    AutoNum,
}

#[derive(Clone, Debug, Default)]
struct ParaStyle {
    align: Option<Align>,
    mar_l: Option<f64>,
    indent: Option<f64>,
    bullet: Option<BulletStyle>,
    line_spacing: Option<LineSpacing>,
    space_before: Option<SpaceVal>,
    space_after: Option<SpaceVal>,
    run: RunStyle,
}

#[derive(Clone, Copy, Debug)]
enum SpaceVal {
    Points(f64),
    /// fraction of the font size
    Percent(f64),
}

impl ParaStyle {
    fn over(&self, c: &ParaStyle) -> ParaStyle {
        ParaStyle {
            align: c.align.or(self.align),
            mar_l: c.mar_l.or(self.mar_l),
            indent: c.indent.or(self.indent),
            bullet: c.bullet.clone().or_else(|| self.bullet.clone()),
            line_spacing: c.line_spacing.clone().or_else(|| self.line_spacing.clone()),
            space_before: c.space_before.or(self.space_before),
            space_after: c.space_after.or(self.space_after),
            run: self.run.over(&c.run),
        }
    }
}

type ListStyle = Vec<ParaStyle>; // 9 levels

fn empty_list() -> ListStyle {
    vec![ParaStyle::default(); 9]
}
fn list_over(base: &ListStyle, child: &ListStyle) -> ListStyle {
    base.iter().zip(child.iter()).map(|(b, c)| b.over(c)).collect()
}

#[derive(Clone, Debug, Default)]
struct BodyAttrs {
    anchor: Option<Anchor>,
    insets: [Option<f64>; 4],
    wrap: Option<bool>,
}

impl BodyAttrs {
    fn over(&self, c: &BodyAttrs) -> BodyAttrs {
        BodyAttrs {
            anchor: c.anchor.or(self.anchor),
            insets: [
                c.insets[0].or(self.insets[0]),
                c.insets[1].or(self.insets[1]),
                c.insets[2].or(self.insets[2]),
                c.insets[3].or(self.insets[3]),
            ],
            wrap: c.wrap.or(self.wrap),
        }
    }
}

#[derive(Clone, Debug)]
struct Xfrm {
    rect: Rect,
    rot: f64,
    flip_h: bool,
    flip_v: bool,
}

#[derive(Clone, Debug)]
struct Placeholder {
    ty: String,
    idx: String,
    xfrm: Option<Xfrm>,
    list: ListStyle,
    body: BodyAttrs,
}

#[derive(Default)]
struct Layer {
    background: Option<Background>,
    placeholders: Vec<Placeholder>,
    statics: Vec<Element>,
}

struct Env {
    theme: HashMap<String, Color>,
    clr_map: HashMap<String, String>,
    major: String,
    minor: String,
    title_style: ListStyle,
    body_style: ListStyle,
    other_style: ListStyle,
}

struct PartCtx<'a> {
    env: &'a Env,
    rels: &'a HashMap<String, (String, String)>,
    slide_no: usize,
    /// placeholder sources, nearest first (layout, then master)
    parents: Vec<&'a [Placeholder]>,
    media: &'a mut Vec<String>,
}

// ── colors ───────────────────────────────────────────────────────────────────
fn rgb_to_hsl(c: Color) -> (f32, f32, f32) {
    let (r, g, b) = (c.r / 255.0, c.g / 255.0, c.b / 255.0);
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if (max - min).abs() < 1e-6 {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h / 6.0, s, l)
}
fn hsl_to_rgb(h: f32, s: f32, l: f32, a: f32) -> Color {
    if s <= 0.0 {
        return Color { r: l * 255.0, g: l * 255.0, b: l * 255.0, a };
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let f = |mut t: f32| {
        if t < 0.0 {
            t += 1.0
        }
        if t > 1.0 {
            t -= 1.0
        }
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    Color { r: f(h + 1.0 / 3.0) * 255.0, g: f(h) * 255.0, b: f(h - 1.0 / 3.0) * 255.0, a }
}

/// `n` is a color element (srgbClr, schemeClr, sysClr, prstClr).
fn color_node(n: Node, env: &Env) -> Option<Color> {
    let mut c = match n.tag_name().name() {
        "srgbClr" => Color::from_hex(n.attribute("val")?)?,
        "sysClr" => Color::from_hex(n.attribute("lastClr").unwrap_or("000000"))?,
        "prstClr" => match n.attribute("val")? {
            "white" => Color::WHITE,
            _ => Color::BLACK,
        },
        "schemeClr" => {
            let v = n.attribute("val")?;
            let key = env.clr_map.get(v).map(|s| s.as_str()).unwrap_or(v);
            *env.theme.get(key)?
        }
        _ => return None,
    };
    for m in n.children().filter(|c| c.is_element()) {
        let v = (attr_f(m, "val").unwrap_or(100000.0) / 100000.0) as f32;
        match m.tag_name().name() {
            "alpha" => c.a *= v,
            "lumMod" => {
                let (h, s, l) = rgb_to_hsl(c);
                c = hsl_to_rgb(h, s, (l * v).clamp(0.0, 1.0), c.a);
            }
            "lumOff" => {
                let (h, s, l) = rgb_to_hsl(c);
                c = hsl_to_rgb(h, s, (l + v).clamp(0.0, 1.0), c.a);
            }
            "tint" => {
                c.r += (255.0 - c.r) * (1.0 - v);
                c.g += (255.0 - c.g) * (1.0 - v);
                c.b += (255.0 - c.b) * (1.0 - v);
            }
            "shade" => {
                c.r *= v;
                c.g *= v;
                c.b *= v;
            }
            _ => {}
        }
    }
    Some(c)
}

/// First color found among the element children of `n` (e.g. a solidFill).
fn color_in(n: Node, env: &Env) -> Option<Color> {
    n.children().filter(|c| c.is_element()).find_map(|c| color_node(c, env))
}

/// Fill declared on `n` (spPr, rPr, ln…): Some(None) = explicitly no fill.
fn fill_of(n: Node, env: &Env) -> Option<Option<Color>> {
    for c in n.children().filter(|c| c.is_element()) {
        match c.tag_name().name() {
            "noFill" => return Some(None),
            "solidFill" => return Some(color_in(c, env)),
            "gradFill" => {
                let first = desc(c, "gs").and_then(|gs| color_in(gs, env));
                return Some(first);
            }
            _ => {}
        }
    }
    None
}

// ── text styles ──────────────────────────────────────────────────────────────
fn font_name(face: &str, env: &Env) -> String {
    match face {
        f if f.starts_with("+mj") => env.major.clone(),
        f if f.starts_with("+mn") => env.minor.clone(),
        f => f.to_string(),
    }
}

fn run_style(n: Node, env: &Env) -> RunStyle {
    RunStyle {
        size: attr_f(n, "sz").map(|v| v / 100.0),
        bold: attr_b(n, "b"),
        italic: attr_b(n, "i"),
        underline: n.attribute("u").map(|v| v != "none"),
        strike: n.attribute("strike").map(|v| v != "noStrike"),
        color: fill_of(n, env).flatten(),
        font: kid(n, "latin").and_then(|l| l.attribute("typeface")).map(|f| font_name(f, env)),
        spacing: attr_f(n, "spc").map(|v| v / 100.0),
        baseline: attr_f(n, "baseline").map(|v| v / 1000.0),
    }
}

fn space_val(n: Node) -> Option<SpaceVal> {
    if let Some(p) = kid(n, "spcPts") {
        return attr_f(p, "val").map(|v| SpaceVal::Points(v / 100.0));
    }
    kid(n, "spcPct").and_then(|p| attr_f(p, "val")).map(|v| SpaceVal::Percent(v / 100000.0))
}

fn para_style(n: Node, env: &Env) -> ParaStyle {
    let bullet = if kid(n, "buNone").is_some() {
        Some(BulletStyle::None)
    } else if let Some(b) = kid(n, "buChar") {
        Some(BulletStyle::Char(b.attribute("char").unwrap_or("•").to_string()))
    } else if kid(n, "buAutoNum").is_some() {
        Some(BulletStyle::AutoNum)
    } else {
        None
    };
    let line_spacing = kid(n, "lnSpc").and_then(|l| {
        if let Some(p) = kid(l, "spcPts") {
            attr_f(p, "val").map(|v| LineSpacing::Points(v / 100.0))
        } else {
            kid(l, "spcPct").and_then(|p| attr_f(p, "val")).map(|v| LineSpacing::Percent(v / 100000.0))
        }
    });
    ParaStyle {
        align: n.attribute("algn").map(|a| match a {
            "ctr" => Align::Center,
            "r" => Align::Right,
            "just" | "dist" => Align::Justify,
            _ => Align::Left,
        }),
        mar_l: attr_f(n, "marL"),
        indent: attr_f(n, "indent"),
        bullet,
        line_spacing,
        space_before: kid(n, "spcBef").and_then(space_val),
        space_after: kid(n, "spcAft").and_then(space_val),
        run: kid(n, "defRPr").map(|r| run_style(r, env)).unwrap_or_default(),
    }
}

/// `n` holds lvl1pPr … lvl9pPr children (a lstStyle, titleStyle, …).
fn list_style(n: Option<Node>, env: &Env) -> ListStyle {
    let mut out = empty_list();
    if let Some(n) = n {
        for (i, slot) in out.iter_mut().enumerate() {
            let name = format!("lvl{}pPr", i + 1);
            if let Some(l) = n.children().find(|c| c.is_element() && c.tag_name().name() == name) {
                *slot = para_style(l, env);
            }
        }
    }
    out
}

fn body_attrs(n: Option<Node>) -> BodyAttrs {
    let Some(n) = n else { return BodyAttrs::default() };
    BodyAttrs {
        anchor: n.attribute("anchor").map(|a| match a {
            "ctr" => Anchor::Middle,
            "b" => Anchor::Bottom,
            _ => Anchor::Top,
        }),
        insets: [attr_f(n, "lIns"), attr_f(n, "tIns"), attr_f(n, "rIns"), attr_f(n, "bIns")],
        wrap: n.attribute("wrap").map(|w| w != "none"),
    }
}

fn xfrm_of(x: Option<Node>) -> Option<Xfrm> {
    let x = x?;
    let off = kid(x, "off")?;
    let ext = kid(x, "ext")?;
    Some(Xfrm {
        rect: Rect { x: attr_f(off, "x")?, y: attr_f(off, "y")?, w: attr_f(ext, "cx")?, h: attr_f(ext, "cy")? },
        rot: attr_f(x, "rot").unwrap_or(0.0) / 60000.0,
        flip_h: attr_b(x, "flipH").unwrap_or(false),
        flip_v: attr_b(x, "flipV").unwrap_or(false),
    })
}

fn geom_of(sp_pr: Option<Node>) -> Geom {
    let Some(g) = sp_pr.and_then(|s| kid(s, "prstGeom")) else { return Geom::Rect };
    let adj = desc(g, "gd")
        .and_then(|gd| gd.attribute("fmla"))
        .and_then(|f| f.strip_prefix("val "))
        .and_then(|v| v.trim().parse::<f64>().ok());
    match g.attribute("prst").unwrap_or("rect") {
        "roundRect" | "round1Rect" | "round2SameRect" | "round2DiagRect" => Geom::RoundRect((adj.unwrap_or(16667.0) / 100000.0).clamp(0.0, 0.5)),
        "ellipse" => Geom::Ellipse,
        "line" | "straightConnector1" => Geom::Line,
        "triangle" => Geom::Triangle,
        "rtTriangle" => Geom::RtTriangle,
        "diamond" => Geom::Diamond,
        "parallelogram" => Geom::Parallelogram,
        "hexagon" => Geom::Hexagon,
        "chevron" => Geom::Chevron,
        "rightArrow" => Geom::RightArrow,
        "homePlate" | "pentagon" => Geom::Pentagon,
        _ => Geom::Rect,
    }
}

fn stroke_of(sp_pr: Option<Node>, env: &Env) -> Option<Stroke> {
    let ln = kid(sp_pr?, "ln")?;
    let color = fill_of(ln, env)??;
    let dash = match kid(ln, "prstDash").and_then(|d| d.attribute("val")).unwrap_or("solid") {
        "solid" => Dash::Solid,
        "dot" | "sysDot" => Dash::Dot,
        _ => Dash::Dash,
    };
    Some(Stroke { color, width: attr_f(ln, "w").unwrap_or(9525.0), dash })
}

fn shadow_of(sp_pr: Option<Node>, env: &Env) -> Option<Shadow> {
    let sh = desc(kid(sp_pr?, "effectLst")?, "outerShdw")?;
    let color = color_in(sh, env)?;
    let dist = attr_f(sh, "dist").unwrap_or(0.0);
    let dir = (attr_f(sh, "dir").unwrap_or(0.0) / 60000.0).to_radians();
    Some(Shadow { color, blur: attr_f(sh, "blurRad").unwrap_or(0.0), dx: dist * dir.cos(), dy: dist * dir.sin() })
}

fn ph_of(nv: Option<Node>) -> Option<(String, String)> {
    let ph = desc(nv?, "ph")?;
    Some((ph.attribute("type").unwrap_or("body").to_string(), ph.attribute("idx").unwrap_or("").to_string()))
}

fn find_parent<'a>(list: &'a [Placeholder], ty: &str, idx: &str) -> Option<&'a Placeholder> {
    list.iter()
        .find(|p| !idx.is_empty() && p.idx == idx)
        .or_else(|| list.iter().find(|p| p.ty == ty))
        .or_else(|| match ty {
            "ctrTitle" => list.iter().find(|p| p.ty == "title"),
            "subTitle" => list.iter().find(|p| p.ty == "body"),
            _ => None,
        })
}

fn text_body(tx: Node, base: &ListStyle, body: &BodyAttrs, ctx: &PartCtx) -> Option<TextBody> {
    let env = ctx.env;
    let body_pr = kid(tx, "bodyPr");
    let attrs = body.over(&body_attrs(body_pr));
    let list = list_over(base, &list_style(kid(tx, "lstStyle"), env));
    let font_scale = body_pr.and_then(|b| kid(b, "normAutofit")).and_then(|a| attr_f(a, "fontScale")).map(|v| v / 100000.0).unwrap_or(1.0);
    let mut paragraphs = Vec::new();
    let mut number = 0u32;
    for p in kids(tx, "p") {
        let p_pr = kid(p, "pPr");
        let lvl = p_pr.and_then(|n| attr_f(n, "lvl")).unwrap_or(0.0).clamp(0.0, 8.0) as usize;
        let style = match p_pr {
            Some(n) => list[lvl].over(&para_style(n, env)),
            None => list[lvl].clone(),
        };
        let mut runs = Vec::new();
        for r in p.children().filter(|c| c.is_element()) {
            let tag = r.tag_name().name();
            if tag != "r" && tag != "br" && tag != "fld" {
                continue;
            }
            let rs = match kid(r, "rPr") {
                Some(n) => style.run.over(&run_style(n, env)),
                None => style.run.clone(),
            };
            let mut text = kid(r, "t").and_then(|t| t.text()).unwrap_or("").to_string();
            if tag == "fld" && r.attribute("type") == Some("slidenum") {
                text = ctx.slide_no.to_string();
            }
            runs.push(Run {
                text,
                size: rs.size.unwrap_or(18.0),
                bold: rs.bold.unwrap_or(false),
                italic: rs.italic.unwrap_or(false),
                underline: rs.underline.unwrap_or(false),
                strike: rs.strike.unwrap_or(false),
                color: rs.color.unwrap_or(Color::BLACK),
                font: rs.font.clone().unwrap_or_else(|| env.minor.clone()),
                spacing: rs.spacing.unwrap_or(0.0),
                baseline: rs.baseline.unwrap_or(0.0),
                line_break: tag == "br",
            });
        }
        let end_size = kid(p, "endParaRPr").and_then(|e| attr_f(e, "sz")).map(|v| v / 100.0).or(style.run.size).unwrap_or(18.0);
        let ref_size = runs.iter().map(|r| r.size).fold(0.0, f64::max).max(if runs.is_empty() { end_size } else { 0.0 });
        let space = |v: Option<SpaceVal>| match v {
            Some(SpaceVal::Points(p)) => p,
            Some(SpaceVal::Percent(f)) => f * ref_size * 1.2,
            None => 0.0,
        };
        let bullet = match style.bullet.clone().unwrap_or(BulletStyle::None) {
            BulletStyle::None => {
                number = 0;
                Bullet::None
            }
            BulletStyle::Char(c) => {
                number = 0;
                Bullet::Char(c)
            }
            BulletStyle::AutoNum => {
                number += 1;
                Bullet::Number(number)
            }
        };
        let has_text = runs.iter().any(|r| !r.text.is_empty());
        paragraphs.push(Paragraph {
            runs,
            align: style.align.unwrap_or(Align::Left),
            mar_l: style.mar_l.unwrap_or(0.0),
            indent: style.indent.unwrap_or(0.0),
            bullet: if has_text { bullet } else { Bullet::None },
            line_spacing: style.line_spacing.clone().unwrap_or(LineSpacing::Percent(1.0)),
            space_before: space(style.space_before),
            space_after: space(style.space_after),
            end_size,
        });
    }
    if !paragraphs.iter().any(|p| p.runs.iter().any(|r| !r.text.is_empty())) {
        return None;
    }
    Some(TextBody {
        paragraphs,
        anchor: attrs.anchor.unwrap_or(Anchor::Top),
        insets: [
            attrs.insets[0].unwrap_or(91440.0),
            attrs.insets[1].unwrap_or(45720.0),
            attrs.insets[2].unwrap_or(91440.0),
            attrs.insets[3].unwrap_or(45720.0),
        ],
        wrap: attrs.wrap.unwrap_or(true),
        font_scale,
        vertical: body_pr.and_then(|b| b.attribute("vert")).map(|v| v != "horz").unwrap_or(false),
    })
}

/// Walks a shape tree. Placeholders are collected for inheritance; `draw_placeholders`
/// says whether they are also drawn (slides: yes; layouts and masters: no).
fn shape_tree(tree: Node, ctx: &mut PartCtx, draw_placeholders: bool, layer: &mut Layer) {
    let env = ctx.env;
    for n in tree.children().filter(|c| c.is_element()) {
        let tag = n.tag_name().name();
        match tag {
            "sp" | "cxnSp" => {
                let nv = n.children().find(|c| c.is_element() && c.tag_name().name().starts_with("nv"));
                let c_nv = nv.and_then(|v| kid(v, "cNvPr"));
                let id = c_nv.and_then(|c| attr_f(c, "id")).unwrap_or(0.0) as u32;
                let name = c_nv.and_then(|c| c.attribute("name")).unwrap_or("").to_string();
                let sp_pr = kid(n, "spPr");
                let ph = ph_of(nv);
                let own_xfrm = xfrm_of(sp_pr.and_then(|s| kid(s, "xfrm")));

                // inheritance chain for placeholders
                let mut base = match &ph {
                    Some((ty, _)) if ty == "title" || ty == "ctrTitle" => env.title_style.clone(),
                    Some((ty, _)) if matches!(ty.as_str(), "body" | "subTitle" | "obj") => env.body_style.clone(),
                    _ => env.other_style.clone(),
                };
                let mut body = BodyAttrs::default();
                let mut xfrm = None;
                if let Some((ty, idx)) = &ph {
                    // farthest ancestor first
                    for parent in ctx.parents.iter().rev() {
                        if let Some(p) = find_parent(parent, ty, idx) {
                            base = list_over(&base, &p.list);
                            body = body.over(&p.body);
                            if p.xfrm.is_some() {
                                xfrm = p.xfrm.clone();
                            }
                        }
                    }
                }
                let xfrm = own_xfrm.clone().or(xfrm);
                let tx = kid(n, "txBody");

                if let Some((ty, idx)) = &ph {
                    let own_list = list_style(tx.and_then(|t| kid(t, "lstStyle")), env);
                    layer.placeholders.push(Placeholder {
                        ty: ty.clone(),
                        idx: idx.clone(),
                        xfrm: own_xfrm,
                        list: own_list,
                        body: body_attrs(tx.and_then(|t| kid(t, "bodyPr"))),
                    });
                    if !draw_placeholders {
                        continue;
                    }
                }
                let Some(x) = xfrm else { continue };
                let text = tx.and_then(|t| text_body(t, &base, &body, ctx));
                let fill = sp_pr.and_then(|s| fill_of(s, env)).flatten();
                let stroke = stroke_of(sp_pr, env);
                if fill.is_none() && stroke.is_none() && text.is_none() {
                    continue;
                }
                layer.statics.push(Element {
                    id,
                    name,
                    rect: x.rect,
                    rot: x.rot,
                    flip_h: x.flip_h,
                    flip_v: x.flip_v,
                    kind: Kind::Shape { geom: geom_of(sp_pr), fill, stroke, shadow: shadow_of(sp_pr, env), text },
                });
            }
            "pic" => {
                let c_nv = path(n, &["nvPicPr", "cNvPr"]);
                let id = c_nv.and_then(|c| attr_f(c, "id")).unwrap_or(0.0) as u32;
                let name = c_nv.and_then(|c| c.attribute("name")).unwrap_or("").to_string();
                let sp_pr = kid(n, "spPr");
                let Some(x) = xfrm_of(sp_pr.and_then(|s| kid(s, "xfrm"))) else { continue };
                let blip_fill = kid(n, "blipFill");
                let blip = blip_fill.and_then(|b| kid(b, "blip"));
                let rid = blip.and_then(|b| b.attributes().find(|a| a.name() == "embed").map(|a| a.value().to_string()));
                let Some(media) = rid.and_then(|r| ctx.rels.get(&r)).map(|(_, t)| t.clone()) else { continue };
                if !ctx.media.contains(&media) {
                    ctx.media.push(media.clone());
                }
                let alpha = blip.and_then(|b| kid(b, "alphaModFix")).and_then(|a| attr_f(a, "amt")).map(|v| (v / 100000.0) as f32).unwrap_or(1.0);
                let crop = blip_fill
                    .and_then(|b| kid(b, "srcRect"))
                    .map(|s| {
                        let f = |k: &str| attr_f(s, k).unwrap_or(0.0) / 100000.0;
                        [f("l"), f("t"), f("r"), f("b")]
                    })
                    .unwrap_or([0.0; 4]);
                layer.statics.push(Element {
                    id,
                    name,
                    rect: x.rect,
                    rot: x.rot,
                    flip_h: x.flip_h,
                    flip_v: x.flip_v,
                    kind: Kind::Picture { media, crop, alpha, geom: geom_of(sp_pr) },
                });
            }
            "graphicFrame" => {
                let c_nv = path(n, &["nvGraphicFramePr", "cNvPr"]);
                let Some(x) = xfrm_of(kid(n, "xfrm")) else { continue };
                layer.statics.push(Element {
                    id: c_nv.and_then(|c| attr_f(c, "id")).unwrap_or(0.0) as u32,
                    name: c_nv.and_then(|c| c.attribute("name")).unwrap_or("").to_string(),
                    rect: x.rect,
                    rot: 0.0,
                    flip_h: false,
                    flip_v: false,
                    kind: Kind::Fallback,
                });
            }
            "grpSp" => shape_tree(n, ctx, draw_placeholders, layer),
            _ => {}
        }
    }
}

fn background_of(c_sld: Node, ctx: &mut PartCtx) -> Option<Background> {
    let bg_pr = path(c_sld, &["bg", "bgPr"])?;
    if let Some(blip) = desc(bg_pr, "blip") {
        let rid = blip.attributes().find(|a| a.name() == "embed")?.value().to_string();
        let media = ctx.rels.get(&rid)?.1.clone();
        if !ctx.media.contains(&media) {
            ctx.media.push(media.clone());
        }
        return Some(Background::Image(media));
    }
    fill_of(bg_pr, ctx.env).flatten().map(Background::Color)
}

// ── motion ───────────────────────────────────────────────────────────────────
fn dir_of(v: Option<&str>, default: Dir) -> Dir {
    match v {
        Some("l") => Dir::Left,
        Some("r") => Dir::Right,
        Some("u") => Dir::Up,
        Some("d") => Dir::Down,
        _ => default,
    }
}

fn transition_of(root: Node) -> Transition {
    let none = Transition { kind: TransitionKind::None, duration_ms: 0.0 };
    let Some(t) = desc(root, "transition") else { return none };
    let Some(child) = t.children().find(|c| c.is_element()) else {
        return Transition { kind: TransitionKind::Fade, duration_ms: 600.0 };
    };
    let d = child.attribute("dir");
    let kind = match child.tag_name().name() {
        "fade" => TransitionKind::Fade,
        "push" => TransitionKind::Push(dir_of(d, Dir::Left)),
        "wipe" => TransitionKind::Wipe(dir_of(d, Dir::Left)),
        "cover" => TransitionKind::Cover(dir_of(d, Dir::Left)),
        "pull" => TransitionKind::Pull(dir_of(d, Dir::Left)),
        "split" => TransitionKind::Split,
        "zoom" => TransitionKind::Zoom,
        "dissolve" => TransitionKind::Dissolve,
        "morph" => TransitionKind::Morph,
        _ => TransitionKind::Fade,
    };
    let explicit = t.attributes().find(|a| a.name() == "dur").and_then(|a| a.value().parse::<f64>().ok());
    let duration_ms = explicit.unwrap_or(match (t.attribute("spd"), &kind) {
        (_, TransitionKind::Morph) => 1100.0,
        (Some("fast"), _) => 450.0,
        (Some("slow"), _) => 1000.0,
        _ => 700.0,
    });
    Transition { kind, duration_ms }
}

fn cond_delay(c_tn: Node) -> f64 {
    kid(c_tn, "stCondLst")
        .and_then(|l| kids(l, "cond").filter_map(|c| c.attribute("delay").and_then(|d| d.parse::<f64>().ok())).next())
        .unwrap_or(0.0)
}

fn timing_of(root: Node) -> Vec<ClickGroup> {
    let mut groups = Vec::new();
    let Some(timing) = kid(root, "timing") else { return groups };
    let Some(main) = timing.descendants().find(|n| n.is_element() && n.tag_name().name() == "cTn" && n.attribute("nodeType") == Some("mainSeq")) else {
        return groups;
    };
    let Some(list) = kid(main, "childTnLst") else { return groups };
    for click in kids(list, "par") {
        let Some(c_tn) = kid(click, "cTn") else { continue };
        let auto = kid(c_tn, "stCondLst").map(|l| kids(l, "cond").any(|c| c.attribute("evt") == Some("onBegin"))).unwrap_or(false);
        let mut effects = Vec::new();
        let Some(subs) = kid(c_tn, "childTnLst") else { continue };
        for sub in kids(subs, "par") {
            let Some(sub_tn) = kid(sub, "cTn") else { continue };
            let offset = cond_delay(sub_tn);
            let Some(fx_list) = kid(sub_tn, "childTnLst") else { continue };
            for fx in kids(fx_list, "par") {
                let Some(fx_tn) = kid(fx, "cTn") else { continue };
                if fx_tn.attribute("presetClass") != Some("entr") {
                    continue;
                }
                let Some(shape_id) = desc(fx, "spTgt").and_then(|s| attr_f(s, "spid")) else { continue };
                let preset = attr_f(fx_tn, "presetID").unwrap_or(10.0) as u32;
                let from = match attr_f(fx_tn, "presetSubtype").unwrap_or(4.0) as u32 {
                    1 => Dir::Up,
                    2 => Dir::Right,
                    8 => Dir::Left,
                    _ => Dir::Down,
                };
                let kind = match preset {
                    1 => EffectKind::Appear,
                    2 => EffectKind::Fly,
                    22 => EffectKind::Wipe,
                    42 | 37 | 47 => EffectKind::Rise,
                    53 | 23 => EffectKind::Zoom,
                    _ => EffectKind::Fade,
                };
                let dur = fx
                    .descendants()
                    .filter(|n| n.is_element() && n.tag_name().name() == "cTn" && n.id() != fx_tn.id())
                    .filter_map(|n| attr_f(n, "dur"))
                    .fold(0.0, f64::max);
                effects.push(Effect {
                    shape_id: shape_id as u32,
                    kind,
                    from,
                    start_ms: offset + cond_delay(fx_tn),
                    duration_ms: if kind == EffectKind::Appear { 1.0 } else { dur.max(200.0) },
                });
            }
        }
        if !effects.is_empty() {
            groups.push(ClickGroup { auto, effects });
        }
    }
    groups
}

fn notes_of(files: &Files, rels: &HashMap<String, (String, String)>) -> String {
    let Some((_, target)) = rels.values().find(|(ty, _)| ty == "notesSlide") else { return String::new() };
    let Some(xml) = text_of(files, target) else { return String::new() };
    let Ok(doc) = Document::parse(&xml) else { return String::new() };
    let mut out = Vec::new();
    for sp in doc.descendants().filter(|n| n.is_element() && n.tag_name().name() == "sp") {
        if desc(sp, "ph").and_then(|p| p.attribute("type")) != Some("body") {
            continue;
        }
        for p in sp.descendants().filter(|n| n.is_element() && n.tag_name().name() == "p") {
            let line: String = p.descendants().filter(|n| n.is_element() && n.tag_name().name() == "t").filter_map(|t| t.text()).collect();
            out.push(line);
        }
    }
    out.join("\n").trim().to_string()
}

// ── entry point ──────────────────────────────────────────────────────────────
pub fn parse_deck(bytes: &[u8]) -> Result<Deck, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("not a PPTX file: {e}"))?;
    let mut files: Files = HashMap::new();
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        if f.is_dir() {
            continue;
        }
        let mut buf = Vec::with_capacity(f.size() as usize);
        f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        files.insert(f.name().to_string(), buf);
    }

    let pres_xml = text_of(&files, "ppt/presentation.xml").ok_or("ppt/presentation.xml is missing")?;
    let pres = Document::parse(&pres_xml).map_err(|e| e.to_string())?;
    let pres_rels = rels_of(&files, "ppt/presentation.xml");
    let sz = desc(pres.root_element(), "sldSz");
    let width = sz.and_then(|s| attr_f(s, "cx")).unwrap_or(12192000.0);
    let height = sz.and_then(|s| attr_f(s, "cy")).unwrap_or(6858000.0);
    let slide_parts: Vec<String> = desc(pres.root_element(), "sldIdLst")
        .map(|l| {
            kids(l, "sldId")
                .filter_map(|s| s.attributes().find(|a| a.name() == "id" && a.namespace().is_some()).map(|a| a.value().to_string()))
                .filter_map(|rid| pres_rels.get(&rid).map(|(_, t)| t.clone()))
                .collect()
        })
        .unwrap_or_default();

    let mut media_names: Vec<String> = Vec::new();
    // caches by part name
    let mut masters: HashMap<String, (Env, Layer)> = HashMap::new();
    let mut slides = Vec::new();

    for (i, part) in slide_parts.iter().enumerate() {
        let rels = rels_of(&files, part);
        let layout_part = rels.values().find(|(ty, _)| ty == "slideLayout").map(|(_, t)| t.clone());
        let layout_rels = layout_part.as_ref().map(|p| rels_of(&files, p)).unwrap_or_default();
        let master_part = layout_rels.values().find(|(ty, _)| ty == "slideMaster").map(|(_, t)| t.clone());

        // master (+ theme) once per master
        let master_key = master_part.clone().unwrap_or_default();
        if !masters.contains_key(&master_key) {
            let master_rels = master_part.as_ref().map(|p| rels_of(&files, p)).unwrap_or_default();
            let mut env = Env {
                theme: HashMap::new(),
                clr_map: HashMap::new(),
                major: "Calibri".into(),
                minor: "Calibri".into(),
                title_style: empty_list(),
                body_style: empty_list(),
                other_style: empty_list(),
            };
            if let Some(theme_xml) = master_rels.values().find(|(ty, _)| ty == "theme").and_then(|(_, t)| text_of(&files, t)) {
                if let Ok(theme) = Document::parse(&theme_xml) {
                    if let Some(scheme) = desc(theme.root_element(), "clrScheme") {
                        for c in scheme.children().filter(|c| c.is_element()) {
                            let col = c.children().filter(|x| x.is_element()).find_map(|x| match x.tag_name().name() {
                                "srgbClr" => x.attribute("val").and_then(Color::from_hex),
                                "sysClr" => x.attribute("lastClr").and_then(Color::from_hex),
                                _ => None,
                            });
                            if let Some(col) = col {
                                env.theme.insert(c.tag_name().name().to_string(), col);
                            }
                        }
                    }
                    let face = |which: &str| {
                        desc(theme.root_element(), which).and_then(|f| kid(f, "latin")).and_then(|l| l.attribute("typeface")).filter(|f| !f.is_empty()).map(|f| f.to_string())
                    };
                    if let Some(f) = face("majorFont") {
                        env.major = f;
                    }
                    if let Some(f) = face("minorFont") {
                        env.minor = f;
                    }
                }
            }
            for (k, v) in [("bg1", "lt1"), ("tx1", "dk1"), ("bg2", "lt2"), ("tx2", "dk2")] {
                env.clr_map.insert(k.into(), v.into());
            }
            let mut layer = Layer::default();
            if let Some(xml) = master_part.as_ref().and_then(|p| text_of(&files, p)) {
                if let Ok(doc) = Document::parse(&xml) {
                    let root = doc.root_element();
                    if let Some(map) = kid(root, "clrMap") {
                        for a in map.attributes() {
                            env.clr_map.insert(a.name().to_string(), a.value().to_string());
                        }
                    }
                    if let Some(tx) = kid(root, "txStyles") {
                        env.title_style = list_style(kid(tx, "titleStyle"), &env);
                        env.body_style = list_style(kid(tx, "bodyStyle"), &env);
                        env.other_style = list_style(kid(tx, "otherStyle"), &env);
                    }
                    // non-placeholder text boxes do not take bullets or indents from the master
                    for l in env.other_style.iter_mut() {
                        l.bullet = Some(BulletStyle::None);
                    }
                    if let Some(c_sld) = kid(root, "cSld") {
                        let mut ctx = PartCtx { env: &env, rels: &master_rels, slide_no: 0, parents: vec![], media: &mut media_names };
                        layer.background = background_of(c_sld, &mut ctx);
                        if let Some(tree) = kid(c_sld, "spTree") {
                            shape_tree(tree, &mut ctx, false, &mut layer);
                        }
                    }
                }
            }
            masters.insert(master_key.clone(), (env, layer));
        }
        let (env, master_layer) = masters.get(&master_key).unwrap();

        // layout
        let mut layout_layer = Layer::default();
        let mut show_master = true;
        if let Some(xml) = layout_part.as_ref().and_then(|p| text_of(&files, p)) {
            if let Ok(doc) = Document::parse(&xml) {
                let root = doc.root_element();
                show_master = attr_b(root, "showMasterSp").unwrap_or(true);
                if let Some(c_sld) = kid(root, "cSld") {
                    let mut ctx = PartCtx { env, rels: &layout_rels, slide_no: i + 1, parents: vec![&master_layer.placeholders], media: &mut media_names };
                    layout_layer.background = background_of(c_sld, &mut ctx);
                    if let Some(tree) = kid(c_sld, "spTree") {
                        shape_tree(tree, &mut ctx, false, &mut layout_layer);
                    }
                }
            }
        }

        // slide
        let xml = text_of(&files, part).ok_or_else(|| format!("{part} is missing"))?;
        let doc = Document::parse(&xml).map_err(|e| format!("{part}: {e}"))?;
        let root = doc.root_element();
        let mut layer = Layer::default();
        if let Some(c_sld) = kid(root, "cSld") {
            let mut ctx = PartCtx {
                env,
                rels: &rels,
                slide_no: i + 1,
                parents: vec![&layout_layer.placeholders, &master_layer.placeholders],
                media: &mut media_names,
            };
            layer.background = background_of(c_sld, &mut ctx);
            if let Some(tree) = kid(c_sld, "spTree") {
                shape_tree(tree, &mut ctx, true, &mut layer);
            }
        }
        let show_layout_master = attr_b(root, "showMasterSp").unwrap_or(true);

        let mut elements = Vec::new();
        if show_master && show_layout_master {
            elements.extend(master_layer.statics.iter().cloned());
        }
        if show_layout_master {
            elements.extend(layout_layer.statics.iter().cloned());
        }
        // ids from the layers below must not collide with slide shape ids (animations target slide ids)
        for e in elements.iter_mut() {
            e.id += 1_000_000;
        }
        elements.extend(layer.statics);

        let background = layer
            .background
            .or(layout_layer.background.clone())
            .or(master_layer.background.clone())
            .unwrap_or(Background::Color(*env.theme.get("lt1").unwrap_or(&Color::WHITE)));

        slides.push(Slide { background, elements, transition: transition_of(root), groups: timing_of(root), notes: notes_of(&files, &rels) });
    }

    let media = media_names.into_iter().filter_map(|m| files.get(&m).map(|b| (m.clone(), b.clone()))).collect();
    Ok(Deck { width, height, slides, media })
}
