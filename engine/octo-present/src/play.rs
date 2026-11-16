//! The presentation state machine. Pure logic: given a time, it says what is on
//! screen (a `Frame`), with slide transitions, Morph and entrance effects
//! already resolved into positions, sizes, colors and opacity.

use crate::model::*;

// ── easing ───────────────────────────────────────────────────────────────────
fn clamp01(t: f64) -> f64 {
    t.clamp(0.0, 1.0)
}
/// Smooth start and a long, soft landing (quintic out blended with cubic in).
pub fn ease_in_out(t: f64) -> f64 {
    let t = clamp01(t);
    if t < 0.5 {
        16.0 * t.powi(5)
    } else {
        1.0 - (-2.0 * t + 2.0).powi(5) / 2.0
    }
}
pub fn ease_out(t: f64) -> f64 {
    1.0 - (1.0 - clamp01(t)).powi(4)
}
/// Critically damped spring response: fast departure, settles without overshoot.
pub fn spring(t: f64) -> f64 {
    let t = clamp01(t);
    let w = 9.0;
    let v = 1.0 - (1.0 + w * t) * (-w * t).exp();
    // normalise so that spring(1) == 1
    v / (1.0 - (1.0 + w) * (-w).exp())
}
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

// ── frame ────────────────────────────────────────────────────────────────────
#[derive(Clone, Debug)]
pub struct Item {
    pub el: Element,
    pub alpha: f32,
    /// offset in EMU
    pub dx: f64,
    pub dy: f64,
    pub scale: f64,
    /// reveal: (direction the element is revealed from, fraction shown)
    pub wipe: Option<(Dir, f64)>,
    /// which slide's reference render a Fallback element is cut from
    pub slide: usize,
}

#[derive(Clone, Debug)]
pub struct SlideLayer {
    pub background: Background,
    /// second background cross-faded on top (Morph between different backgrounds)
    pub background_over: Option<(Background, f32)>,
    pub alpha: f32,
    /// offset as a fraction of the slide size
    pub dx: f64,
    pub dy: f64,
    pub scale: f64,
    /// visible part [x0, y0, x1, y1] as fractions
    pub clip: Option<[f64; 4]>,
    pub items: Vec<Item>,
}

#[derive(Clone, Debug, Default)]
pub struct Frame {
    pub layers: Vec<SlideLayer>,
}

struct Running {
    from: usize,
    kind: TransitionKind,
    start: f64,
    duration: f64,
}

pub struct Player {
    pub deck: Deck,
    slide: usize,
    /// start time of each click group of the current slide (None = not played yet)
    started: Vec<Option<f64>>,
    transition: Option<Running>,
}

const DONE: f64 = -1.0e12;

impl Player {
    pub fn new(deck: Deck) -> Player {
        let mut p = Player { deck, slide: 0, started: Vec::new(), transition: None };
        p.enter(0, 0.0, true, 0.0);
        p
    }

    pub fn slide(&self) -> usize {
        self.slide
    }
    pub fn slide_count(&self) -> usize {
        self.deck.slides.len()
    }
    /// Click groups not yet played on the current slide.
    pub fn steps_left(&self) -> usize {
        self.started.iter().filter(|s| s.is_none()).count()
    }

    fn enter(&mut self, index: usize, now: f64, forward: bool, delay: f64) {
        self.slide = index;
        let groups = &self.deck.slides[index].groups;
        self.started = groups
            .iter()
            .enumerate()
            .map(|(i, g)| {
                if !forward {
                    Some(DONE)
                } else if g.auto && i == 0 {
                    Some(now + delay)
                } else {
                    None
                }
            })
            .collect();
    }

    fn group_running(&self, now: f64) -> Option<usize> {
        let groups = &self.deck.slides[self.slide].groups;
        self.started.iter().enumerate().find_map(|(i, s)| match s {
            Some(t) if now < t + groups[i].duration() => Some(i),
            _ => None,
        })
    }

    pub fn is_animating(&self, now: f64) -> bool {
        if let Some(t) = &self.transition {
            if now < t.start + t.duration {
                return true;
            }
        }
        self.group_running(now).is_some()
    }

    /// Advance: finish what is moving, else reveal the next step, else go to the next slide.
    /// Returns false at the very end of the deck.
    pub fn next(&mut self, now: f64) -> bool {
        if let Some(t) = &self.transition {
            if now < t.start + t.duration {
                self.transition = None;
                // auto groups were scheduled after the transition: start them now
                for s in self.started.iter_mut().flatten() {
                    if *s > now {
                        *s = now;
                    }
                }
                return true;
            }
        }
        self.transition = None;
        if let Some(i) = self.group_running(now) {
            self.started[i] = Some(DONE);
            return true;
        }
        if let Some(i) = self.started.iter().position(|s| s.is_none()) {
            self.started[i] = Some(now);
            return true;
        }
        if self.slide + 1 >= self.deck.slides.len() {
            return false;
        }
        let from = self.slide;
        let to = from + 1;
        let tr = self.deck.slides[to].transition.clone();
        let duration = if tr.kind == TransitionKind::None { 0.0 } else { tr.duration_ms };
        self.enter(to, now, true, duration);
        if duration > 0.0 {
            self.transition = Some(Running { from, kind: tr.kind, start: now, duration });
        }
        true
    }

    /// Step back: hide the last revealed step, else show the previous slide fully built.
    pub fn prev(&mut self, now: f64) -> bool {
        self.transition = None;
        let first_manual = self.deck.slides[self.slide].groups.iter().position(|g| !g.auto).unwrap_or(usize::MAX);
        if let Some(i) = self.started.iter().rposition(|s| s.is_some()) {
            if i >= first_manual && first_manual != usize::MAX {
                self.started[i] = None;
                return true;
            }
        }
        if self.slide == 0 {
            return false;
        }
        self.enter(self.slide - 1, now, false, 0.0);
        true
    }

    pub fn goto(&mut self, index: usize, now: f64) {
        self.transition = None;
        let index = index.min(self.deck.slides.len().saturating_sub(1));
        self.enter(index, now, true, 0.0);
    }

    // ── frames ───────────────────────────────────────────────────────────────
    /// Items of slide `index`. `started` = click group start times (None: every effect finished).
    fn slide_items(&self, index: usize, started: Option<&[Option<f64>]>, now: f64) -> Vec<Item> {
        let slide = &self.deck.slides[index];
        let (w, h) = (self.deck.width, self.deck.height);
        let mut out = Vec::with_capacity(slide.elements.len());
        for el in &slide.elements {
            let mut item = Item { el: el.clone(), alpha: 1.0, dx: 0.0, dy: 0.0, scale: 1.0, wipe: None, slide: index };
            if let Some(started) = started {
                // the first effect that targets this shape decides its entrance
                let hit = slide.groups.iter().enumerate().find_map(|(gi, g)| g.effects.iter().find(|e| e.shape_id == el.id).map(|e| (gi, e)));
                if let Some((gi, fx)) = hit {
                    let Some(t0) = started.get(gi).copied().flatten() else { continue };
                    let p = (now - t0 - fx.start_ms) / fx.duration_ms.max(1.0);
                    if p < 0.0 {
                        continue;
                    }
                    let p = clamp01(p);
                    match fx.kind {
                        EffectKind::Appear => {}
                        EffectKind::Fade => item.alpha = ease_out(p) as f32,
                        EffectKind::Rise => {
                            item.alpha = ease_out(p) as f32;
                            item.dy = (1.0 - spring(p)) * h * 0.07;
                        }
                        EffectKind::Zoom => {
                            item.alpha = ease_out(p * 1.6) as f32;
                            item.scale = lerp(0.72, 1.0, spring(p));
                        }
                        EffectKind::Wipe => item.wipe = Some((fx.from, ease_in_out(p))),
                        EffectKind::Fly => {
                            let t = 1.0 - spring(p);
                            item.alpha = ease_out(p * 2.5) as f32;
                            match fx.from {
                                Dir::Left => item.dx = -(el.rect.x + el.rect.w) * t,
                                Dir::Right => item.dx = (w - el.rect.x) * t,
                                Dir::Up => item.dy = -(el.rect.y + el.rect.h) * t,
                                Dir::Down => item.dy = (h - el.rect.y) * t,
                            }
                        }
                    }
                }
            }
            out.push(item);
        }
        out
    }

    fn plain_layer(&self, index: usize, items: Vec<Item>) -> SlideLayer {
        SlideLayer { background: self.deck.slides[index].background.clone(), background_over: None, alpha: 1.0, dx: 0.0, dy: 0.0, scale: 1.0, clip: None, items }
    }

    /// A slide as it looks when fully built (thumbnails, editor preview).
    pub fn static_frame(&self, index: usize) -> Frame {
        let index = index.min(self.deck.slides.len().saturating_sub(1));
        Frame { layers: vec![self.plain_layer(index, self.slide_items(index, None, 0.0))] }
    }

    pub fn frame(&self, now: f64) -> Frame {
        let to = self.slide;
        let current = self.slide_items(to, Some(&self.started), now);
        let Some(tr) = self.transition.as_ref().filter(|t| now < t.start + t.duration) else {
            return Frame { layers: vec![self.plain_layer(to, current)] };
        };
        let p = clamp01((now - tr.start) / tr.duration);
        let from = tr.from;
        // the outgoing slide is shown as it was left: fully built
        let out_items = self.slide_items(from, None, now);
        let mut outgoing = self.plain_layer(from, out_items);
        let mut incoming = self.plain_layer(to, current);
        let t = ease_in_out(p);
        let shift = |d: &Dir, amount: f64| match d {
            Dir::Left => (-amount, 0.0),
            Dir::Right => (amount, 0.0),
            Dir::Up => (0.0, -amount),
            Dir::Down => (0.0, amount),
        };
        match &tr.kind {
            TransitionKind::Morph => return Frame { layers: vec![self.morph_layer(from, to, p)] },
            TransitionKind::None => return Frame { layers: vec![incoming] },
            TransitionKind::Fade | TransitionKind::Dissolve => {
                incoming.alpha = ease_out(p) as f32;
            }
            TransitionKind::Push(d) => {
                let s = spring(p);
                let (ox, oy) = shift(d, s);
                let (ix, iy) = shift(d, s - 1.0);
                outgoing.dx = ox;
                outgoing.dy = oy;
                incoming.dx = ix;
                incoming.dy = iy;
            }
            TransitionKind::Cover(d) => {
                let (ix, iy) = shift(d, spring(p) - 1.0);
                incoming.dx = ix;
                incoming.dy = iy;
                outgoing.scale = lerp(1.0, 0.96, t);
            }
            TransitionKind::Pull(d) => {
                let (ox, oy) = shift(d, ease_in_out(p));
                outgoing.dx = ox;
                outgoing.dy = oy;
                return Frame { layers: vec![incoming, outgoing] };
            }
            TransitionKind::Wipe(d) => {
                incoming.clip = Some(match d {
                    Dir::Left => [1.0 - t, 0.0, 1.0, 1.0],
                    Dir::Right => [0.0, 0.0, t, 1.0],
                    Dir::Up => [0.0, 1.0 - t, 1.0, 1.0],
                    Dir::Down => [0.0, 0.0, 1.0, t],
                });
            }
            TransitionKind::Split => {
                incoming.clip = Some([0.5 - t / 2.0, 0.0, 0.5 + t / 2.0, 1.0]);
            }
            TransitionKind::Zoom => {
                incoming.alpha = ease_out(p * 1.4) as f32;
                incoming.scale = lerp(0.86, 1.0, spring(p));
                outgoing.scale = lerp(1.0, 1.1, t);
            }
        }
        Frame { layers: vec![outgoing, incoming] }
    }

    // ── Morph ────────────────────────────────────────────────────────────────
    fn morph_layer(&self, from: usize, to: usize, p: f64) -> SlideLayer {
        let a_slide = &self.deck.slides[from];
        let b_slide = &self.deck.slides[to];
        let t = spring(p);
        let tf = t as f32;

        // elements of the target that enter later by an effect are not part of the morph
        let enters_later = |id: u32| b_slide.groups.iter().any(|g| g.effects.iter().any(|e| e.shape_id == id));
        let b_els: Vec<&Element> = b_slide.elements.iter().filter(|e| !enters_later(e.id)).collect();
        let a_els: Vec<&Element> = a_slide.elements.iter().collect();

        let mut pair_of_b: Vec<Option<usize>> = vec![None; b_els.len()];
        let mut a_used = vec![false; a_els.len()];
        let mut pass = |rule: &dyn Fn(&Element, &Element) -> bool| {
            for (bi, b) in b_els.iter().enumerate() {
                if pair_of_b[bi].is_some() {
                    continue;
                }
                if let Some(ai) = (0..a_els.len()).find(|&ai| !a_used[ai] && rule(a_els[ai], b)) {
                    a_used[ai] = true;
                    pair_of_b[bi] = Some(ai);
                }
            }
        };
        pass(&|a, b| a.name.starts_with("!!") && a.name == b.name);
        pass(&|a, b| !generic_name(&a.name) && a.name == b.name && same_class(a, b));
        pass(&|a, b| match (&a.kind, &b.kind) {
            (Kind::Picture { media: m1, .. }, Kind::Picture { media: m2, .. }) => m1 == m2,
            _ => false,
        });
        pass(&|a, b| match (text_of(a), text_of(b)) {
            (Some(x), Some(y)) => !x.trim().is_empty() && x == y,
            _ => false,
        });

        let mut items = Vec::new();
        // leaving elements dissolve early
        let leave = (1.0 - ease_out(p * 2.2)) as f32;
        for (ai, a) in a_els.iter().enumerate() {
            if !a_used[ai] && leave > 0.001 {
                items.push(Item { el: (*a).clone(), alpha: leave, dx: 0.0, dy: 0.0, scale: lerp(1.0, 0.97, p), wipe: None, slide: from });
            }
        }
        // arriving elements settle in late
        let arrive = ease_out((p - 0.35) / 0.65) as f32;
        for (bi, b) in b_els.iter().enumerate() {
            match pair_of_b[bi] {
                None => {
                    if arrive > 0.001 {
                        items.push(Item { el: (*b).clone(), alpha: arrive, dx: 0.0, dy: (1.0 - spring((p - 0.35) / 0.65)) * self.deck.height * 0.025, scale: 1.0, wipe: None, slide: to });
                    }
                }
                Some(ai) => {
                    let a = a_els[ai];
                    let rect = Rect { x: lerp(a.rect.x, b.rect.x, t), y: lerp(a.rect.y, b.rect.y, t), w: lerp(a.rect.w, b.rect.w, t), h: lerp(a.rect.h, b.rect.h, t) };
                    // rotate the short way round
                    let mut dr = (b.rot - a.rot) % 360.0;
                    if dr > 180.0 {
                        dr -= 360.0;
                    }
                    if dr < -180.0 {
                        dr += 360.0;
                    }
                    let rot = a.rot + dr * t;
                    match blend(a, b, t) {
                        Some(kind) => items.push(Item {
                            el: Element { id: b.id, name: b.name.clone(), rect, rot, flip_h: b.flip_h, flip_v: b.flip_v, kind },
                            alpha: 1.0,
                            dx: 0.0,
                            dy: 0.0,
                            scale: 1.0,
                            wipe: None,
                            slide: to,
                        }),
                        None => {
                            // same object, different content: travel together and cross-fade
                            let mut ea = a.clone();
                            ea.rect = rect;
                            ea.rot = rot;
                            let mut eb = (*b).clone();
                            eb.rect = rect;
                            eb.rot = rot;
                            items.push(Item { el: ea, alpha: 1.0 - tf, dx: 0.0, dy: 0.0, scale: 1.0, wipe: None, slide: from });
                            items.push(Item { el: eb, alpha: tf, dx: 0.0, dy: 0.0, scale: 1.0, wipe: None, slide: to });
                        }
                    }
                }
            }
        }

        let (background, background_over) = match (&a_slide.background, &b_slide.background) {
            (Background::Color(x), Background::Color(y)) => (Background::Color(x.lerp(*y, tf)), None),
            (x, y) if x == y => (x.clone(), None),
            (x, y) => (x.clone(), Some((y.clone(), tf))),
        };
        SlideLayer { background, background_over, alpha: 1.0, dx: 0.0, dy: 0.0, scale: 1.0, clip: None, items }
    }
}

fn generic_name(name: &str) -> bool {
    name.is_empty()
        || ["Text ", "Shape ", "Image ", "Picture ", "Chart ", "Table ", "Media ", "Slide Number", "TextBox ", "Rectangle ", "Oval "].iter().any(|p| name.starts_with(p))
}

fn same_class(a: &Element, b: &Element) -> bool {
    matches!(
        (&a.kind, &b.kind),
        (Kind::Shape { .. }, Kind::Shape { .. }) | (Kind::Picture { .. }, Kind::Picture { .. }) | (Kind::Fallback, Kind::Fallback)
    )
}

fn text_of(e: &Element) -> Option<String> {
    match &e.kind {
        Kind::Shape { text: Some(t), .. } => Some(t.plain()),
        _ => None,
    }
}

fn blend_color(a: Option<Color>, b: Option<Color>, t: f32) -> Option<Color> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.lerp(y, t)),
        (Some(x), None) => Some(Color { a: x.a * (1.0 - t), ..x }),
        (None, Some(y)) => Some(Color { a: y.a * t, ..y }),
        (None, None) => None,
    }
}

/// One element that is "between" a and b, when their content allows it.
fn blend(a: &Element, b: &Element, t: f64) -> Option<Kind> {
    let tf = t as f32;
    match (&a.kind, &b.kind) {
        (Kind::Picture { media: m1, crop: c1, alpha: a1, geom: g1 }, Kind::Picture { media: m2, crop: c2, alpha: a2, geom: g2 }) if m1 == m2 => Some(Kind::Picture {
            media: m2.clone(),
            crop: [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), lerp(c1[3], c2[3], t)],
            alpha: a1 + (a2 - a1) * tf,
            geom: blend_geom(g1, g2, t),
        }),
        (Kind::Shape { geom: g1, fill: f1, stroke: s1, shadow: sh1, text: t1 }, Kind::Shape { geom: g2, fill: f2, stroke: s2, shadow: sh2, text: t2 }) => {
            let text = match (t1, t2) {
                (None, None) => None,
                (Some(x), Some(y)) if x.plain() == y.plain() && x.paragraphs.len() == y.paragraphs.len() => {
                    let mut out = y.clone();
                    for (pi, para) in out.paragraphs.iter_mut().enumerate() {
                        let src = &x.paragraphs[pi];
                        if src.runs.len() != para.runs.len() {
                            return None;
                        }
                        for (ri, run) in para.runs.iter_mut().enumerate() {
                            run.size = lerp(src.runs[ri].size, run.size, t);
                            run.color = src.runs[ri].color.lerp(run.color, tf);
                            run.spacing = lerp(src.runs[ri].spacing, run.spacing, t);
                        }
                        para.space_before = lerp(src.space_before, para.space_before, t);
                        para.space_after = lerp(src.space_after, para.space_after, t);
                    }
                    for i in 0..4 {
                        out.insets[i] = lerp(x.insets[i], y.insets[i], t);
                    }
                    Some(out)
                }
                _ => return None,
            };
            let stroke = match (s1, s2) {
                (Some(x), Some(y)) => Some(Stroke { color: x.color.lerp(y.color, tf), width: lerp(x.width, y.width, t), dash: y.dash }),
                (Some(x), None) => Some(Stroke { color: Color { a: x.color.a * (1.0 - tf), ..x.color }, width: x.width, dash: x.dash }),
                (None, Some(y)) => Some(Stroke { color: Color { a: y.color.a * tf, ..y.color }, width: y.width, dash: y.dash }),
                (None, None) => None,
            };
            let shadow = match (sh1, sh2) {
                (Some(x), Some(y)) => Some(Shadow { color: x.color.lerp(y.color, tf), blur: lerp(x.blur, y.blur, t), dx: lerp(x.dx, y.dx, t), dy: lerp(x.dy, y.dy, t) }),
                (_, y) => {
                    if t > 0.5 {
                        y.clone()
                    } else {
                        sh1.clone()
                    }
                }
            };
            Some(Kind::Shape { geom: blend_geom(g1, g2, t), fill: blend_color(*f1, *f2, tf), stroke, shadow, text })
        }
        (Kind::Fallback, Kind::Fallback) => None,
        _ => None,
    }
}

fn blend_geom(a: &Geom, b: &Geom, t: f64) -> Geom {
    match (a, b) {
        (Geom::RoundRect(x), Geom::RoundRect(y)) => Geom::RoundRect(lerp(*x, *y, t)),
        (Geom::Rect, Geom::RoundRect(y)) => Geom::RoundRect(y * t),
        (Geom::RoundRect(x), Geom::Rect) => Geom::RoundRect(x * (1.0 - t)),
        // a rectangle becoming a circle (and back) passes through rounder and rounder corners
        (Geom::Rect, Geom::Ellipse) | (Geom::RoundRect(_), Geom::Ellipse) => {
            let from = if let Geom::RoundRect(x) = a { *x } else { 0.0 };
            if t >= 0.999 {
                Geom::Ellipse
            } else {
                Geom::RoundRect(lerp(from, 0.5, t))
            }
        }
        (Geom::Ellipse, Geom::Rect) | (Geom::Ellipse, Geom::RoundRect(_)) => {
            let to = if let Geom::RoundRect(y) = b { *y } else { 0.0 };
            Geom::RoundRect(lerp(0.5, to, t))
        }
        _ => {
            if t > 0.5 {
                b.clone()
            } else {
                a.clone()
            }
        }
    }
}
