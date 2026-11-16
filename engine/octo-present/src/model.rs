//! Scene graph: what a deck looks like after every inheritance rule
//! (theme, master, layout, placeholder) has been resolved. Units are EMU.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const BLACK: Color = Color { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
    pub const WHITE: Color = Color { r: 255.0, g: 255.0, b: 255.0, a: 1.0 };

    pub fn from_hex(hex: &str) -> Option<Color> {
        let h = hex.trim_start_matches('#');
        if h.len() < 6 {
            return None;
        }
        let p = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok().map(|v| v as f32);
        Some(Color { r: p(0)?, g: p(2)?, b: p(4)?, a: 1.0 })
    }

    pub fn lerp(self, o: Color, t: f32) -> Color {
        let l = |a: f32, b: f32| a + (b - a) * t;
        Color { r: l(self.r, o.r), g: l(self.g, o.g), b: l(self.b, o.b), a: l(self.a, o.a) }
    }

    pub fn css(self, alpha_mul: f32) -> String {
        format!(
            "rgba({},{},{},{:.4})",
            self.r.round().clamp(0.0, 255.0),
            self.g.round().clamp(0.0, 255.0),
            self.b.round().clamp(0.0, 255.0),
            (self.a * alpha_mul).clamp(0.0, 1.0)
        )
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Stroke {
    pub color: Color,
    pub width: f64,
    pub dash: Dash,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dash {
    Solid,
    Dash,
    Dot,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Shadow {
    pub color: Color,
    pub blur: f64,
    pub dx: f64,
    pub dy: f64,
}

/// A gradient fill: stops at positions 0..1, linear at `angle` degrees (0 = left to
/// right, clockwise, as in DrawingML) or radial from the center.
#[derive(Clone, Debug, PartialEq)]
pub struct Gradient {
    pub stops: Vec<(f64, Color)>,
    pub angle: f64,
    pub radial: bool,
}

impl Gradient {
    /// The color at position t (used where a single color is needed).
    pub fn sample(&self, t: f64) -> Color {
        let Some(first) = self.stops.first() else { return Color::BLACK };
        if t <= first.0 {
            return first.1;
        }
        for w in self.stops.windows(2) {
            let ((p0, c0), (p1, c1)) = (w[0], w[1]);
            if t <= p1 {
                let f = if p1 > p0 { (t - p0) / (p1 - p0) } else { 1.0 };
                return c0.lerp(c1, f as f32);
            }
        }
        self.stops.last().unwrap().1
    }

    pub fn lerp(&self, o: &Gradient, t: f64) -> Gradient {
        // resample both on the union of stop positions
        let mut at: Vec<f64> = self.stops.iter().chain(o.stops.iter()).map(|s| s.0).collect();
        at.sort_by(|a, b| a.partial_cmp(b).unwrap());
        at.dedup_by(|a, b| (*a - *b).abs() < 1e-4);
        let tf = t as f32;
        let mut d = o.angle - self.angle;
        if d > 180.0 {
            d -= 360.0;
        }
        if d < -180.0 {
            d += 360.0;
        }
        Gradient {
            stops: at.into_iter().map(|p| (p, self.sample(p).lerp(o.sample(p), tf))).collect(),
            angle: self.angle + d * t,
            radial: if t > 0.5 { o.radial } else { self.radial },
        }
    }

    pub fn solid(c: Color) -> Gradient {
        Gradient { stops: vec![(0.0, c), (1.0, c)], angle: 0.0, radial: false }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Geom {
    Rect,
    /// corner radius as a fraction of the shorter side (0..0.5)
    RoundRect(f64),
    Ellipse,
    Line,
    Triangle,
    RtTriangle,
    Diamond,
    Parallelogram,
    Hexagon,
    Chevron,
    RightArrow,
    Pentagon,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Align {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Anchor {
    Top,
    Middle,
    Bottom,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Run {
    pub text: String,
    /// points
    pub size: f64,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
    pub color: Color,
    pub font: String,
    /// extra letter spacing in points
    pub spacing: f64,
    /// +30 superscript / -25 subscript (percent), 0 = normal
    pub baseline: f64,
    pub line_break: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Bullet {
    None,
    Char(String),
    Number(u32),
}

#[derive(Clone, Debug, PartialEq)]
pub enum LineSpacing {
    Percent(f64),
    Points(f64),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Paragraph {
    pub runs: Vec<Run>,
    pub align: Align,
    pub mar_l: f64,
    pub indent: f64,
    pub bullet: Bullet,
    pub line_spacing: LineSpacing,
    /// points
    pub space_before: f64,
    pub space_after: f64,
    /// style of an empty paragraph (its height)
    pub end_size: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TextBody {
    pub paragraphs: Vec<Paragraph>,
    pub anchor: Anchor,
    pub insets: [f64; 4], // l t r b (EMU)
    pub wrap: bool,
    pub font_scale: f64,
    pub vertical: bool,
}

impl TextBody {
    pub fn plain(&self) -> String {
        self.paragraphs
            .iter()
            .map(|p| p.runs.iter().map(|r| if r.line_break { "\n" } else { r.text.as_str() }).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// One table cell. A cell covered by a neighbour's span has `covered` set and is not drawn.
#[derive(Clone, Debug, PartialEq)]
pub struct Cell {
    pub text: Option<TextBody>,
    pub fill: Option<Color>,
    /// left, top, right, bottom
    pub borders: [Option<Stroke>; 4],
    pub col_span: usize,
    pub row_span: usize,
    pub covered: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Table {
    /// column widths (EMU)
    pub cols: Vec<f64>,
    /// (minimum row height, cells); a row grows to fit its text
    pub rows: Vec<(f64, Vec<Cell>)>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ChartType {
    Bar { horizontal: bool, stacked: bool, percent: bool },
    Line,
    Area,
    Pie,
    /// hole size, 0..1
    Doughnut(f64),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum LegendPos {
    Top,
    Bottom,
    Left,
    Right,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Series {
    pub name: String,
    pub values: Vec<f64>,
    pub color: Option<Color>,
    /// per data point colors (pie slices)
    pub points: Vec<Option<Color>>,
    pub line_width: f64,
}

/// Text style of one part of a chart (title, axis, data labels, legend).
#[derive(Clone, Debug, PartialEq)]
pub struct ChartText {
    pub size: f64,
    pub bold: bool,
    pub color: Color,
    pub font: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Chart {
    pub kind: ChartType,
    pub title: Option<String>,
    pub categories: Vec<String>,
    pub series: Vec<Series>,
    pub show_values: bool,
    pub show_percent: bool,
    pub number_format: String,
    pub legend: Option<LegendPos>,
    pub grid: Option<Stroke>,
    pub axis_line: Option<Stroke>,
    pub show_cat_axis: bool,
    pub show_val_axis: bool,
    /// bar gap as a fraction of a bar width
    pub gap: f64,
    pub title_text: ChartText,
    pub axis_text: ChartText,
    pub label_text: ChartText,
    pub legend_text: ChartText,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Kind {
    /// `gradient` (when set) is drawn instead of `fill`; `fill` then holds its first stop.
    Shape { geom: Geom, fill: Option<Color>, gradient: Option<Gradient>, stroke: Option<Stroke>, shadow: Option<Shadow>, text: Option<TextBody> },
    /// crop = fractions cut from l, t, r, b of the source image
    Picture { media: String, crop: [f64; 4], alpha: f32, geom: Geom },
    Table(Table),
    Chart(Box<Chart>),
    /// anything else not drawn natively: taken from the reference render
    Fallback,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Element {
    pub id: u32,
    pub name: String,
    pub rect: Rect,
    /// degrees, clockwise
    pub rot: f64,
    pub flip_h: bool,
    pub flip_v: bool,
    pub kind: Kind,
    /// ids of the groups this element sits in (an animation on a group moves its members)
    pub parents: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Background {
    Color(Color),
    Gradient(Gradient),
    Image(String),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dir {
    Left,
    Right,
    Up,
    Down,
}

#[derive(Clone, Debug, PartialEq)]
pub enum TransitionKind {
    None,
    Fade,
    Push(Dir),
    Wipe(Dir),
    Cover(Dir),
    Pull(Dir),
    Split,
    Zoom,
    Dissolve,
    Morph,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Transition {
    pub kind: TransitionKind,
    pub duration_ms: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EffectKind {
    Appear,
    Fade,
    Fly,
    Rise,
    Wipe,
    Zoom,
    // emphasis
    Pulse,
    Spin,
    Grow,
    Teeter,
    Transparency,
}

/// Entrance effects reveal, exit effects hide, emphasis effects act on a visible element.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EffectClass {
    Entrance,
    Exit,
    Emphasis,
}

/// One entrance effect. `start_ms` is measured from the start of its click group.
#[derive(Clone, Debug, PartialEq)]
pub struct Effect {
    pub shape_id: u32,
    pub class: EffectClass,
    pub kind: EffectKind,
    /// Spin: degrees; Grow: scale factor; Transparency: final opacity (0..1)
    pub amount: f64,
    /// where it comes from
    pub from: Dir,
    pub start_ms: f64,
    pub duration_ms: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ClickGroup {
    /// plays by itself when the slide appears
    pub auto: bool,
    pub effects: Vec<Effect>,
}

impl ClickGroup {
    pub fn duration(&self) -> f64 {
        self.effects.iter().map(|e| e.start_ms + e.duration_ms).fold(0.0, f64::max)
    }
}

#[derive(Clone, Debug)]
pub struct Slide {
    pub background: Background,
    pub elements: Vec<Element>,
    pub transition: Transition,
    pub groups: Vec<ClickGroup>,
    pub notes: String,
}

#[derive(Clone, Debug)]
pub struct Deck {
    pub width: f64,
    pub height: f64,
    pub slides: Vec<Slide>,
    /// media part name -> bytes
    pub media: Vec<(String, Vec<u8>)>,
}
