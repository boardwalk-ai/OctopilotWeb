use octo_present::model::*;
fn main() {
    let path = std::env::args().nth(1).expect("usage: dump <file.pptx>");
    let deck = octo_present::parse_deck(&std::fs::read(path).unwrap()).unwrap();
    println!("{}x{} EMU, {} slides, {} media", deck.width, deck.height, deck.slides.len(), deck.media.len());
    for (i, s) in deck.slides.iter().enumerate() {
        println!("--- slide {} bg={:?} transition={:?} groups={} notes={}ch", i + 1, s.background, s.transition, s.groups.len(), s.notes.len());
        for g in &s.groups {
            println!("    group auto={} {:?}", g.auto, g.effects.iter().map(|e| (e.shape_id, e.class, e.kind, e.amount, e.start_ms, e.duration_ms)).collect::<Vec<_>>());
        }
        for e in &s.elements {
            let d = match &e.kind {
                Kind::Shape { geom, fill, text, .. } => format!(
                    "shape {:?} fill={} text={:?}",
                    geom,
                    fill.map(|c| c.css(1.0)).unwrap_or("-".into()),
                    text.as_ref().map(|t| {
                        let r = t.paragraphs.iter().flat_map(|p| p.runs.iter()).next();
                        (t.plain().chars().take(28).collect::<String>(), r.map(|r| (r.size, r.font.clone(), r.bold, r.color.css(1.0))))
                    })
                ),
                Kind::Picture { media, .. } => format!("pic {media}"),
                Kind::Table(t) => format!("table {} cols x {} rows", t.cols.len(), t.rows.len()),
                Kind::Chart(c) => format!("chart {:?} {} series x {} cats, values={} pct={} legend={:?} title={:?}", c.kind, c.series.len(), c.categories.len(), c.show_values, c.show_percent, c.legend, c.title),
                Kind::Fallback => "fallback".into(),
            };
            println!("  #{:<3} {:<22} {:>5.2},{:>5.2} {:>5.2}x{:<5.2} {}", e.id, e.name, e.rect.x / 914400.0, e.rect.y / 914400.0, e.rect.w / 914400.0, e.rect.h / 914400.0, d);
        }
    }
}
