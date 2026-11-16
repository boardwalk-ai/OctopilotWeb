//! WebAssembly front end: paints frames on a Canvas2D context.
//! Text is shaped by the browser (so every script works); line breaking,
//! alignment, spacing and anchoring are done here to match PowerPoint.

use crate::model::*;
use crate::play::{Frame, Item, Player, SlideLayer};
use std::cell::RefCell;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d as Ctx, HtmlCanvasElement, HtmlImageElement};

const EMU_PER_PT: f64 = 12700.0;

#[wasm_bindgen]
pub struct Engine {
    player: Player,
    images: HashMap<String, HtmlImageElement>,
    references: HashMap<usize, HtmlImageElement>,
    measure: RefCell<HashMap<String, f64>>,
    metrics: RefCell<HashMap<String, (f64, f64)>>,
    scratch: RefCell<Vec<(HtmlCanvasElement, Ctx)>>,
}

fn js_err(e: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&e.to_string())
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    pub fn new(pptx: &[u8]) -> Result<Engine, JsValue> {
        let deck = crate::parse::parse_deck(pptx).map_err(js_err)?;
        if deck.slides.is_empty() {
            return Err(js_err("the deck has no slides"));
        }
        Ok(Engine {
            player: Player::new(deck),
            images: HashMap::new(),
            references: HashMap::new(),
            measure: RefCell::new(HashMap::new()),
            metrics: RefCell::new(HashMap::new()),
            scratch: RefCell::new(Vec::new()),
        })
    }

    #[wasm_bindgen(js_name = slideCount)]
    pub fn slide_count(&self) -> usize {
        self.player.slide_count()
    }
    /// width / height of a slide
    pub fn aspect(&self) -> f64 {
        self.player.deck.width / self.player.deck.height
    }
    pub fn slide(&self) -> usize {
        self.player.slide()
    }
    #[wasm_bindgen(js_name = stepsLeft)]
    pub fn steps_left(&self) -> usize {
        self.player.steps_left()
    }
    pub fn notes(&self, index: usize) -> String {
        self.player.deck.slides.get(index).map(|s| s.notes.clone()).unwrap_or_default()
    }
    #[wasm_bindgen(js_name = transitionName)]
    pub fn transition_name(&self, index: usize) -> String {
        self.player.deck.slides.get(index).map(|s| format!("{:?}", s.transition.kind)).unwrap_or_default()
    }

    /// Image parts the page must decode and hand back with `setImage`.
    #[wasm_bindgen(js_name = mediaNames)]
    pub fn media_names(&self) -> Vec<String> {
        self.player.deck.media.iter().map(|(n, _)| n.clone()).collect()
    }
    #[wasm_bindgen(js_name = mediaBytes)]
    pub fn media_bytes(&self, name: &str) -> Vec<u8> {
        self.player.deck.media.iter().find(|(n, _)| n == name).map(|(_, b)| b.clone()).unwrap_or_default()
    }
    #[wasm_bindgen(js_name = setImage)]
    pub fn set_image(&mut self, name: String, image: HtmlImageElement) {
        self.images.insert(name, image);
    }
    /// A reference render of a slide, used for charts and tables.
    #[wasm_bindgen(js_name = setReference)]
    pub fn set_reference(&mut self, index: usize, image: HtmlImageElement) {
        self.references.insert(index, image);
    }
    /// Font families used by the deck (to preload before the first frame).
    pub fn fonts(&self) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for s in &self.player.deck.slides {
            for e in &s.elements {
                if let Kind::Shape { text: Some(t), .. } = &e.kind {
                    for r in t.paragraphs.iter().flat_map(|p| p.runs.iter()) {
                        if !out.contains(&r.font) {
                            out.push(r.font.clone());
                        }
                    }
                }
            }
        }
        out
    }
    /// Fonts changed (web fonts finished loading): forget cached text measurements.
    #[wasm_bindgen(js_name = fontsChanged)]
    pub fn fonts_changed(&self) {
        self.measure.borrow_mut().clear();
        self.metrics.borrow_mut().clear();
    }

    pub fn next(&mut self, now: f64) -> bool {
        self.player.next(now)
    }
    pub fn prev(&mut self, now: f64) -> bool {
        self.player.prev(now)
    }
    pub fn goto(&mut self, index: usize, now: f64) {
        self.player.goto(index, now)
    }

    /// Paints the presentation at time `now` (ms). Returns true while something is moving.
    pub fn render(&self, ctx: &Ctx, width: f64, height: f64, now: f64) -> Result<bool, JsValue> {
        let frame = self.player.frame(now);
        self.paint(ctx, &frame, width, height)?;
        Ok(self.player.is_animating(now))
    }

    /// Paints one slide fully built (thumbnails, previews).
    #[wasm_bindgen(js_name = renderSlide)]
    pub fn render_slide(&self, ctx: &Ctx, width: f64, height: f64, index: usize) -> Result<(), JsValue> {
        self.paint(ctx, &self.player.static_frame(index), width, height)
    }
}

// ── painting ─────────────────────────────────────────────────────────────────
impl Engine {
    fn scratch_ctx(&self, slot: usize, w: f64, h: f64) -> Result<(HtmlCanvasElement, Ctx), JsValue> {
        let mut pool = self.scratch.borrow_mut();
        while pool.len() <= slot {
            let doc = web_sys::window().and_then(|w| w.document()).ok_or_else(|| js_err("no document"))?;
            let canvas: HtmlCanvasElement = doc.create_element("canvas")?.dyn_into()?;
            let ctx: Ctx = canvas.get_context("2d")?.ok_or_else(|| js_err("no 2d context"))?.dyn_into()?;
            pool.push((canvas, ctx));
        }
        let (canvas, ctx) = pool[slot].clone();
        if canvas.width() != w as u32 || canvas.height() != h as u32 {
            canvas.set_width(w as u32);
            canvas.set_height(h as u32);
        }
        Ok((canvas, ctx))
    }

    fn paint(&self, ctx: &Ctx, frame: &Frame, w: f64, h: f64) -> Result<(), JsValue> {
        ctx.set_global_alpha(1.0);
        ctx.set_fill_style_str("#000");
        ctx.fill_rect(0.0, 0.0, w, h);
        let simple = frame.layers.len() == 1 && {
            let l = &frame.layers[0];
            l.alpha >= 0.999 && l.clip.is_none() && l.dx == 0.0 && l.dy == 0.0 && l.scale == 1.0
        };
        if simple {
            return self.paint_layer(ctx, &frame.layers[0], w, h);
        }
        for (i, layer) in frame.layers.iter().enumerate() {
            // each slide is composed on its own surface, then placed as one picture
            let (canvas, off) = self.scratch_ctx(i, w, h)?;
            self.paint_layer(&off, layer, w, h)?;
            ctx.save();
            ctx.set_global_alpha(layer.alpha.clamp(0.0, 1.0) as f64);
            if let Some(c) = layer.clip {
                ctx.begin_path();
                ctx.rect(c[0] * w, c[1] * h, (c[2] - c[0]) * w, (c[3] - c[1]) * h);
                ctx.clip();
            }
            ctx.translate(w / 2.0 + layer.dx * w, h / 2.0 + layer.dy * h)?;
            ctx.scale(layer.scale, layer.scale)?;
            ctx.draw_image_with_html_canvas_element_and_dw_and_dh(&canvas, -w / 2.0, -h / 2.0, w, h)?;
            ctx.restore();
        }
        Ok(())
    }

    fn paint_background(&self, ctx: &Ctx, bg: &Background, alpha: f64, w: f64, h: f64) -> Result<(), JsValue> {
        ctx.set_global_alpha(alpha);
        match bg {
            Background::Color(c) => {
                ctx.set_fill_style_str(&c.css(1.0));
                ctx.fill_rect(0.0, 0.0, w, h);
            }
            Background::Image(name) => {
                if let Some(img) = self.images.get(name) {
                    ctx.draw_image_with_html_image_element_and_dw_and_dh(img, 0.0, 0.0, w, h)?;
                }
            }
        }
        ctx.set_global_alpha(1.0);
        Ok(())
    }

    fn paint_layer(&self, ctx: &Ctx, layer: &SlideLayer, w: f64, h: f64) -> Result<(), JsValue> {
        ctx.save();
        ctx.set_global_alpha(1.0);
        ctx.clear_rect(0.0, 0.0, w, h);
        self.paint_background(ctx, &layer.background, 1.0, w, h)?;
        if let Some((bg, a)) = &layer.background_over {
            self.paint_background(ctx, bg, *a as f64, w, h)?;
        }
        let s = w / self.player.deck.width;
        for item in &layer.items {
            self.paint_item(ctx, item, s)?;
        }
        ctx.restore();
        Ok(())
    }

    fn path(&self, ctx: &Ctx, geom: &Geom, w: f64, h: f64) -> Result<(), JsValue> {
        let (x0, y0, x1, y1) = (-w / 2.0, -h / 2.0, w / 2.0, h / 2.0);
        ctx.begin_path();
        let poly = |pts: &[(f64, f64)]| {
            for (i, (px, py)) in pts.iter().enumerate() {
                let (x, y) = (x0 + px * w, y0 + py * h);
                if i == 0 {
                    ctx.move_to(x, y)
                } else {
                    ctx.line_to(x, y)
                }
            }
            ctx.close_path();
        };
        match geom {
            Geom::Rect => ctx.rect(x0, y0, w, h),
            Geom::RoundRect(f) => {
                let r = (f * w.min(h)).min(w / 2.0).min(h / 2.0).max(0.0);
                ctx.move_to(x0 + r, y0);
                ctx.arc_to(x1, y0, x1, y1, r)?;
                ctx.arc_to(x1, y1, x0, y1, r)?;
                ctx.arc_to(x0, y1, x0, y0, r)?;
                ctx.arc_to(x0, y0, x1, y0, r)?;
                ctx.close_path();
            }
            Geom::Ellipse => ctx.ellipse(0.0, 0.0, w / 2.0, h / 2.0, 0.0, 0.0, std::f64::consts::TAU)?,
            Geom::Line => {
                ctx.move_to(x0, y0);
                ctx.line_to(x1, y1);
            }
            Geom::Triangle => poly(&[(0.5, 0.0), (1.0, 1.0), (0.0, 1.0)]),
            Geom::RtTriangle => poly(&[(0.0, 0.0), (1.0, 1.0), (0.0, 1.0)]),
            Geom::Diamond => poly(&[(0.5, 0.0), (1.0, 0.5), (0.5, 1.0), (0.0, 0.5)]),
            Geom::Parallelogram => poly(&[(0.25, 0.0), (1.0, 0.0), (0.75, 1.0), (0.0, 1.0)]),
            Geom::Hexagon => poly(&[(0.25, 0.0), (0.75, 0.0), (1.0, 0.5), (0.75, 1.0), (0.25, 1.0), (0.0, 0.5)]),
            Geom::Chevron => {
                let k = (h / 2.0 / w.max(1.0)).min(0.5);
                poly(&[(0.0, 0.0), (1.0 - k, 0.0), (1.0, 0.5), (1.0 - k, 1.0), (0.0, 1.0), (k, 0.5)])
            }
            Geom::Pentagon => {
                let k = (h / 2.0 / w.max(1.0)).min(0.5);
                poly(&[(0.0, 0.0), (1.0 - k, 0.0), (1.0, 0.5), (1.0 - k, 1.0), (0.0, 1.0)])
            }
            Geom::RightArrow => {
                let k = (h / 2.0 / w.max(1.0)).min(0.5);
                poly(&[(0.0, 0.25), (1.0 - k, 0.25), (1.0 - k, 0.0), (1.0, 0.5), (1.0 - k, 1.0), (1.0 - k, 0.75), (0.0, 0.75)])
            }
        }
        Ok(())
    }

    fn paint_item(&self, ctx: &Ctx, item: &Item, s: f64) -> Result<(), JsValue> {
        if item.alpha <= 0.001 {
            return Ok(());
        }
        let el = &item.el;
        let (w, h) = (el.rect.w * s, el.rect.h * s);
        ctx.save();
        ctx.set_global_alpha(item.alpha.clamp(0.0, 1.0) as f64);
        ctx.translate((el.rect.x + item.dx) * s + w / 2.0, (el.rect.y + item.dy) * s + h / 2.0)?;
        if el.rot != 0.0 {
            ctx.rotate(el.rot.to_radians())?;
        }
        if item.scale != 1.0 {
            ctx.scale(item.scale, item.scale)?;
        }
        if let Some((from, f)) = item.wipe {
            ctx.begin_path();
            match from {
                Dir::Left => ctx.rect(-w / 2.0, -h / 2.0, w * f, h),
                Dir::Right => ctx.rect(w / 2.0 - w * f, -h / 2.0, w * f, h),
                Dir::Up => ctx.rect(-w / 2.0, -h / 2.0, w, h * f),
                Dir::Down => ctx.rect(-w / 2.0, h / 2.0 - h * f, w, h * f),
            }
            ctx.clip();
        }
        ctx.save();
        if el.flip_h || el.flip_v {
            ctx.scale(if el.flip_h { -1.0 } else { 1.0 }, if el.flip_v { -1.0 } else { 1.0 })?;
        }
        match &el.kind {
            Kind::Shape { geom, fill, stroke, shadow, .. } => {
                if let Some(c) = fill {
                    if let Some(sh) = shadow {
                        ctx.set_shadow_color(&sh.color.css(1.0));
                        ctx.set_shadow_blur(sh.blur * s);
                        ctx.set_shadow_offset_x(sh.dx * s);
                        ctx.set_shadow_offset_y(sh.dy * s);
                    }
                    self.path(ctx, geom, w, h)?;
                    ctx.set_fill_style_str(&c.css(1.0));
                    ctx.fill();
                    ctx.set_shadow_color("rgba(0,0,0,0)");
                }
                if let Some(st) = stroke {
                    self.path(ctx, geom, w, h)?;
                    let lw = (st.width * s).max(0.5);
                    ctx.set_line_width(lw);
                    ctx.set_stroke_style_str(&st.color.css(1.0));
                    let dash = js_sys::Array::new();
                    match st.dash {
                        Dash::Solid => {}
                        Dash::Dash => {
                            dash.push(&JsValue::from_f64(lw * 4.0));
                            dash.push(&JsValue::from_f64(lw * 3.0));
                        }
                        Dash::Dot => {
                            dash.push(&JsValue::from_f64(lw));
                            dash.push(&JsValue::from_f64(lw * 2.0));
                        }
                    }
                    ctx.set_line_dash(&dash)?;
                    ctx.stroke();
                }
            }
            Kind::Picture { media, crop, alpha, geom } => {
                if let Some(img) = self.images.get(media) {
                    let (nw, nh) = (img.natural_width() as f64, img.natural_height() as f64);
                    if nw > 0.0 && nh > 0.0 {
                        if *geom != Geom::Rect {
                            self.path(ctx, geom, w, h)?;
                            ctx.clip();
                        }
                        ctx.set_global_alpha((item.alpha * alpha).clamp(0.0, 1.0) as f64);
                        let (sx, sy) = (crop[0] * nw, crop[1] * nh);
                        let (sw, sh) = ((1.0 - crop[0] - crop[2]).max(0.01) * nw, (1.0 - crop[1] - crop[3]).max(0.01) * nh);
                        ctx.draw_image_with_html_image_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(img, sx, sy, sw, sh, -w / 2.0, -h / 2.0, w, h)?;
                    }
                }
            }
            Kind::Fallback => {
                if let Some(img) = self.references.get(&item.slide) {
                    let (nw, nh) = (img.natural_width() as f64, img.natural_height() as f64);
                    let d = &self.player.deck;
                    ctx.draw_image_with_html_image_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(
                        img,
                        el.rect.x / d.width * nw,
                        el.rect.y / d.height * nh,
                        el.rect.w / d.width * nw,
                        el.rect.h / d.height * nh,
                        -w / 2.0,
                        -h / 2.0,
                        w,
                        h,
                    )?;
                }
            }
        }
        ctx.restore();
        // text is never mirrored
        if let Kind::Shape { text: Some(text), .. } = &el.kind {
            self.paint_text(ctx, text, w, h, s)?;
        }
        ctx.restore();
        Ok(())
    }

    // ── text ─────────────────────────────────────────────────────────────────
    fn width_of(&self, ctx: &Ctx, font: &str, text: &str) -> f64 {
        let key = format!("{font}\u{1}{text}");
        if let Some(w) = self.measure.borrow().get(&key) {
            return *w;
        }
        ctx.set_font(font);
        let w = ctx.measure_text(text).map(|m| m.width()).unwrap_or(0.0);
        self.measure.borrow_mut().insert(key, w);
        w
    }

    /// (ascent, descent) of the font's line box.
    fn metrics_of(&self, ctx: &Ctx, font: &str, px: f64) -> (f64, f64) {
        if let Some(m) = self.metrics.borrow().get(font) {
            return *m;
        }
        ctx.set_font(font);
        let m = ctx
            .measure_text("Hg")
            .ok()
            .map(|m| (m.font_bounding_box_ascent(), m.font_bounding_box_descent()))
            .filter(|(a, d)| a.is_finite() && d.is_finite() && a + d > 0.0)
            .unwrap_or((px * 0.95, px * 0.25));
        self.metrics.borrow_mut().insert(font.to_string(), m);
        m
    }

    fn paint_text(&self, ctx: &Ctx, body: &TextBody, w: f64, h: f64, s: f64) -> Result<(), JsValue> {
        struct Tok {
            text: String,
            font: String,
            color: Color,
            width: f64,
            trimmed: f64,
            asc: f64,
            desc: f64,
            px: f64,
            spacing: f64,
            underline: bool,
            strike: bool,
            shift: f64,
            hard_break: bool,
        }
        struct Line {
            toks: Vec<Tok>,
            width: f64,
            asc: f64,
            desc: f64,
            x: f64,
            bullet: Option<(String, String, Color, f64)>,
            gap_before: f64,
            factor: LineSpacing,
        }

        let pt = EMU_PER_PT * s * body.font_scale;
        let inner_w = (w - (body.insets[0] + body.insets[2]) * s).max(1.0);
        let inner_h = (h - (body.insets[1] + body.insets[3]) * s).max(1.0);
        let mut lines: Vec<Line> = Vec::new();

        for (pi, para) in body.paragraphs.iter().enumerate() {
            let mar = para.mar_l * s;
            let first_x = if para.bullet == Bullet::None { mar + para.indent * s } else { mar };
            let avail = (inner_w - mar).max(1.0);
            let gap_before = if pi == 0 { 0.0 } else { (para.space_before + body.paragraphs[pi - 1].space_after) * EMU_PER_PT * s };

            // tokens
            let mut toks: Vec<Tok> = Vec::new();
            for run in &para.runs {
                let px = (run.size * pt * if run.baseline != 0.0 { 0.66 } else { 1.0 }).max(1.0);
                let font = css_font(run, px);
                let (asc, desc) = self.metrics_of(ctx, &font, px);
                let spacing = run.spacing * EMU_PER_PT * s;
                let shift = -run.baseline / 100.0 * run.size * pt;
                if run.line_break {
                    toks.push(Tok { text: String::new(), font, color: run.color, width: 0.0, trimmed: 0.0, asc, desc, px, spacing, underline: false, strike: false, shift, hard_break: true });
                    continue;
                }
                for piece in split_breakable(&run.text) {
                    let count = piece.chars().count() as f64;
                    let width = self.width_of(ctx, &font, &piece) + spacing * count;
                    let t = piece.trim_end();
                    let trimmed = if t.len() == piece.len() { width } else { self.width_of(ctx, &font, t) + spacing * t.chars().count() as f64 };
                    toks.push(Tok { text: piece, font: font.clone(), color: run.color, width, trimmed, asc, desc, px, spacing, underline: run.underline, strike: run.strike, shift, hard_break: false });
                }
            }

            let bullet = match &para.bullet {
                Bullet::None => None,
                Bullet::Char(c) => Some(c.clone()),
                Bullet::Number(n) => Some(format!("{n}.")),
            }
            .and_then(|b| toks.first().map(|t| (b, t.font.clone(), t.color, mar + para.indent * s)));

            let para_start = lines.len();
            let mut cur = Line { toks: Vec::new(), width: 0.0, asc: 0.0, desc: 0.0, x: first_x, bullet: bullet.clone(), gap_before, factor: para.line_spacing.clone() };
            let first_avail = (inner_w - first_x).max(1.0);
            let mut limit = first_avail;
            if toks.is_empty() {
                let px = para.end_size * pt;
                cur.asc = px * 0.95;
                cur.desc = px * 0.25;
            }
            for tok in toks {
                if tok.hard_break {
                    if cur.toks.is_empty() {
                        cur.asc = tok.asc;
                        cur.desc = tok.desc;
                    }
                    lines.push(cur);
                    cur = Line { toks: Vec::new(), width: 0.0, asc: 0.0, desc: 0.0, x: mar, bullet: None, gap_before: 0.0, factor: para.line_spacing.clone() };
                    limit = avail;
                    continue;
                }
                if body.wrap && !cur.toks.is_empty() && cur.width + tok.trimmed > limit + 0.5 {
                    lines.push(cur);
                    cur = Line { toks: Vec::new(), width: 0.0, asc: 0.0, desc: 0.0, x: mar, bullet: None, gap_before: 0.0, factor: para.line_spacing.clone() };
                    limit = avail;
                }
                cur.asc = cur.asc.max(tok.asc);
                cur.desc = cur.desc.max(tok.desc);
                cur.width += tok.width;
                cur.toks.push(tok);
            }
            lines.push(cur);
            for line in lines[para_start..].iter_mut() {
                let trailing = line.toks.last().map(|t| t.width - t.trimmed).unwrap_or(0.0);
                let room = (inner_w - line.x - (line.width - trailing)).max(0.0);
                match para.align {
                    Align::Center => line.x += room / 2.0,
                    Align::Right => line.x += room,
                    _ => {}
                }
            }
        }

        // vertical placement
        let line_h = |l: &Line| match l.factor {
            LineSpacing::Percent(p) => (l.asc + l.desc) * p,
            LineSpacing::Points(p) => p * EMU_PER_PT * s,
        };
        let total: f64 = lines.iter().map(|l| l.gap_before + line_h(l)).sum();
        let mut y = -h / 2.0
            + body.insets[1] * s
            + match body.anchor {
                Anchor::Top => 0.0,
                Anchor::Middle => (inner_h - total) / 2.0,
                Anchor::Bottom => inner_h - total,
            };
        let left = -w / 2.0 + body.insets[0] * s;
        ctx.set_text_baseline("alphabetic");
        for line in &lines {
            y += line.gap_before;
            let lh = line_h(line);
            let natural = (line.asc + line.desc).max(1.0);
            let baseline = y + line.asc * (lh / natural).min(1.0) + (lh - natural).max(0.0);
            if let Some((b, font, color, bx)) = &line.bullet {
                ctx.set_font(font);
                ctx.set_fill_style_str(&color.css(1.0));
                ctx.fill_text(b, left + bx, baseline)?;
            }
            let mut x = left + line.x;
            for tok in &line.toks {
                ctx.set_font(&tok.font);
                ctx.set_fill_style_str(&tok.color.css(1.0));
                let _ = js_sys::Reflect::set(ctx, &JsValue::from_str("letterSpacing"), &JsValue::from_str(&format!("{:.3}px", tok.spacing)));
                ctx.fill_text(&tok.text, x, baseline + tok.shift)?;
                if tok.underline || tok.strike {
                    let t = (tok.px / 14.0).max(1.0);
                    let ly = if tok.underline { baseline + tok.px * 0.12 } else { baseline - tok.px * 0.28 };
                    ctx.fill_rect(x, ly, tok.trimmed, t);
                }
                x += tok.width;
            }
            y += lh;
        }
        let _ = js_sys::Reflect::set(ctx, &JsValue::from_str("letterSpacing"), &JsValue::from_str("0px"));
        Ok(())
    }
}

fn css_font(run: &Run, px: f64) -> String {
    let family = match run.font.as_str() {
        "Calibri" | "Calibri Light" => "Calibri, Carlito, 'Segoe UI', Arial".to_string(),
        "Cambria" => "Cambria, Caladea, Georgia".to_string(),
        "Arial" => "Arial, Arimo, 'Liberation Sans', Helvetica".to_string(),
        "Times New Roman" => "'Times New Roman', Tinos, 'Liberation Serif'".to_string(),
        "Courier New" => "'Courier New', Cousine, monospace".to_string(),
        other => format!("'{}', Calibri, Carlito", other.replace('\'', "")),
    };
    format!(
        "{}{}{:.2}px {}, 'Noto Sans Myanmar', 'Myanmar Text', Padauk, sans-serif",
        if run.italic { "italic " } else { "" },
        if run.bold { "bold " } else { "" },
        px,
        family
    )
}

fn is_myanmar_consonant(c: char) -> bool {
    matches!(c, '\u{1000}'..='\u{102A}' | '\u{103F}' | '\u{104C}'..='\u{104F}')
}
fn is_ideograph(c: char) -> bool {
    matches!(c, '\u{2E80}'..='\u{9FFF}' | '\u{AC00}'..='\u{D7AF}' | '\u{F900}'..='\u{FAFF}' | '\u{0E00}'..='\u{0E7F}')
}

/// Splits text into pieces a line may break between: words (with their trailing
/// spaces), Myanmar syllables, and single CJK / Thai characters.
fn split_breakable(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut cur = String::new();
    for (i, &c) in chars.iter().enumerate() {
        let prev = if i > 0 { Some(chars[i - 1]) } else { None };
        let next = chars.get(i + 1).copied();
        let mut break_before = false;
        if let Some(p) = prev {
            if p == ' ' && c != ' ' {
                break_before = true;
            } else if p == '-' && c.is_alphabetic() && cur.chars().count() > 2 {
                break_before = true;
            } else if is_ideograph(c) || is_ideograph(p) {
                break_before = c != ' ' && !c.is_ascii_punctuation();
            } else if is_myanmar_consonant(c) && p != '\u{1039}' && next != Some('\u{103A}') && next != Some('\u{1039}') && p != ' ' {
                // a new syllable starts here (not a stacked or killed consonant)
                break_before = ('\u{1000}'..='\u{109F}').contains(&p);
            }
        }
        if break_before && !cur.is_empty() {
            out.push(std::mem::take(&mut cur));
        }
        cur.push(c);
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}
