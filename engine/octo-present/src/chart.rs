//! DrawingML charts (the c:chartSpace part) -> `Chart`. Covers what decks use:
//! bar/column (clustered, stacked, percent), line, area, pie and doughnut, with
//! titles, data labels, legends, gridlines and series / point colors.

use crate::model::*;
use crate::parse::{attr_f, desc, fill_of, kid, kids, Env};
use roxmltree::{Document, Node};

fn val<'a>(n: Node<'a, 'a>, tag: &'a str) -> Option<&'a str> {
    kid(n, tag).and_then(|c| c.attribute("val"))
}

/// Text style from a c:txPr (or a title's c:rich), with defaults.
fn text_style(n: Option<Node>, env: &Env, size: f64, bold: bool) -> ChartText {
    let def = n.and_then(|n| desc(n, "defRPr")).or_else(|| n.and_then(|n| desc(n, "rPr")));
    ChartText {
        size: def.and_then(|d| attr_f(d, "sz")).map(|v| v / 100.0).unwrap_or(size),
        bold: def.and_then(|d| d.attribute("b")).map(|b| b == "1").unwrap_or(bold),
        color: def.and_then(|d| fill_of(d, env)).flatten().unwrap_or(Color { r: 89.0, g: 89.0, b: 89.0, a: 1.0 }),
        font: def
            .and_then(|d| kid(d, "latin"))
            .and_then(|l| l.attribute("typeface"))
            .filter(|f| !f.starts_with('+'))
            .unwrap_or("Calibri")
            .to_string(),
    }
}

fn line_of(sp_pr: Option<Node>, env: &Env) -> Option<Stroke> {
    let ln = kid(sp_pr?, "ln")?;
    let color = fill_of(ln, env)??;
    Some(Stroke { color, width: attr_f(ln, "w").unwrap_or(9525.0), dash: Dash::Solid })
}

fn str_points(n: Node) -> Vec<(usize, String)> {
    let mut out: Vec<(usize, String)> = n
        .descendants()
        .filter(|p| p.is_element() && p.tag_name().name() == "pt")
        .filter_map(|p| Some((attr_f(p, "idx")? as usize, kid(p, "v")?.text().unwrap_or("").to_string())))
        .collect();
    out.sort_by_key(|p| p.0);
    out.dedup_by_key(|p| p.0);
    out
}

pub(crate) fn parse_chart(xml: &str, env: &Env) -> Option<Chart> {
    let doc = Document::parse(xml).ok()?;
    let chart = desc(doc.root_element(), "chart")?;
    let plot = kid(chart, "plotArea")?;
    let group = plot.children().find(|c| c.is_element() && c.tag_name().name().ends_with("Chart"))?;
    let kind = match group.tag_name().name() {
        "barChart" | "bar3DChart" => {
            let grouping = val(group, "grouping").unwrap_or("clustered");
            ChartType::Bar { horizontal: val(group, "barDir") == Some("bar"), stacked: grouping == "stacked" || grouping == "percentStacked", percent: grouping == "percentStacked" }
        }
        "lineChart" | "line3DChart" => ChartType::Line,
        "areaChart" | "area3DChart" => ChartType::Area,
        "pieChart" | "pie3DChart" => ChartType::Pie,
        "doughnutChart" => ChartType::Doughnut(val(group, "holeSize").and_then(|v| v.parse::<f64>().ok()).unwrap_or(50.0) / 100.0),
        _ => return None,
    };

    let mut categories: Vec<String> = Vec::new();
    let mut series = Vec::new();
    for ser in kids(group, "ser") {
        let name = kid(ser, "tx").map(|t| str_points(t).into_iter().map(|p| p.1).collect::<Vec<_>>().join(" ")).unwrap_or_default();
        let values: Vec<f64> = kid(ser, "val")
            .map(|v| {
                let pts = str_points(v);
                let n = pts.last().map(|p| p.0 + 1).unwrap_or(0);
                let mut out = vec![0.0; n];
                for (i, s) in pts {
                    out[i] = s.trim().parse::<f64>().unwrap_or(0.0);
                }
                out
            })
            .unwrap_or_default();
        if categories.is_empty() {
            if let Some(cat) = kid(ser, "cat") {
                categories = str_points(cat).into_iter().map(|p| p.1).collect();
            }
        }
        let sp_pr = kid(ser, "spPr");
        let mut color = sp_pr.and_then(|s| fill_of(s, env)).flatten();
        let line = line_of(sp_pr, env);
        if matches!(kind, ChartType::Line) {
            color = line.as_ref().map(|l| l.color).or(color);
        }
        let mut points = vec![None; values.len()];
        for dpt in kids(ser, "dPt") {
            let idx = val(dpt, "idx").and_then(|v| v.parse::<f64>().ok());
            if let (Some(i), Some(c)) = (idx, kid(dpt, "spPr").and_then(|s| fill_of(s, env)).flatten()) {
                if (i as usize) < points.len() {
                    points[i as usize] = Some(c);
                }
            }
        }
        series.push(Series { name, values, color, points, line_width: line.map(|l| l.width).unwrap_or(28575.0) });
    }
    if series.is_empty() {
        return None;
    }

    // data labels: series-level settings win over the group's
    let dlbls: Vec<Node> = kids(group, "ser").filter_map(|s| kid(s, "dLbls")).chain(kid(group, "dLbls")).collect();
    let flag = |tag: &str| dlbls.iter().any(|d| val(*d, tag) == Some("1") || kids(*d, "dLbl").any(|l| val(l, tag) == Some("1")));
    let number_format = dlbls
        .iter()
        .find_map(|d| kid(*d, "numFmt").and_then(|f| f.attribute("formatCode")))
        .unwrap_or("General")
        .to_string();

    let title_node = kid(chart, "title");
    let title = title_node.and_then(|t| {
        let text: String = t.descendants().filter(|n| n.is_element() && n.tag_name().name() == "t").filter_map(|n| n.text()).collect();
        (!text.trim().is_empty()).then_some(text)
    });
    let deleted = val(chart, "autoTitleDeleted") == Some("1");

    let cat_ax = kid(plot, "catAx").or_else(|| kid(plot, "dateAx"));
    let val_ax = kid(plot, "valAx");
    let grid = val_ax.and_then(|v| kid(v, "majorGridlines")).map(|g| {
        line_of(kid(g, "spPr"), env).unwrap_or(Stroke { color: Color { r: 217.0, g: 217.0, b: 217.0, a: 1.0 }, width: 9525.0, dash: Dash::Solid })
    });
    let legend = kid(chart, "legend").map(|l| match val(l, "legendPos").unwrap_or("r") {
        "t" => LegendPos::Top,
        "b" => LegendPos::Bottom,
        "l" => LegendPos::Left,
        _ => LegendPos::Right,
    });
    let gap = val(group, "gapWidth").and_then(|v| v.parse::<f64>().ok()).unwrap_or(150.0) / 100.0;

    Some(Chart {
        kind,
        title: if deleted { None } else { title },
        categories,
        series,
        show_values: flag("showVal"),
        show_percent: flag("showPercent"),
        number_format,
        legend,
        grid,
        axis_line: cat_ax.and_then(|a| line_of(kid(a, "spPr"), env)),
        show_cat_axis: cat_ax.map(|a| val(a, "delete") != Some("1")).unwrap_or(false),
        show_val_axis: val_ax.map(|a| val(a, "delete") != Some("1")).unwrap_or(false),
        gap,
        title_text: text_style(title_node, env, 18.0, false),
        axis_text: text_style(cat_ax.and_then(|a| kid(a, "txPr")).or_else(|| val_ax.and_then(|a| kid(a, "txPr"))), env, 10.0, false),
        label_text: text_style(dlbls.iter().find_map(|d| kid(*d, "txPr")), env, 10.0, false),
        legend_text: text_style(kid(chart, "legend").and_then(|l| kid(l, "txPr")), env, 10.0, false),
    })
}

/// Formats a value with the (common subset of) Excel number formats charts use.
pub fn format_number(v: f64, fmt: &str) -> String {
    let percent = fmt.contains('%');
    let v = if percent { v * 100.0 } else { v };
    let decimals = fmt.split('.').nth(1).map(|d| d.chars().take_while(|c| *c == '0').count()).unwrap_or(if fmt == "General" { usize::MAX } else { 0 });
    let mut s = if decimals == usize::MAX {
        let r = (v * 100.0).round() / 100.0;
        if r.fract() == 0.0 { format!("{}", r as i64) } else { format!("{r}") }
    } else {
        format!("{:.*}", decimals, v)
    };
    if fmt.contains(',') {
        let (int, frac) = match s.find('.') {
            Some(i) => (s[..i].to_string(), s[i..].to_string()),
            None => (s.clone(), String::new()),
        };
        let neg = int.starts_with('-');
        let digits: Vec<char> = int.trim_start_matches('-').chars().collect();
        let mut out = String::new();
        for (i, c) in digits.iter().enumerate() {
            if i > 0 && (digits.len() - i) % 3 == 0 {
                out.push(',');
            }
            out.push(*c);
        }
        s = format!("{}{}{}", if neg { "-" } else { "" }, out, frac);
    }
    if fmt.contains('$') {
        s = format!("${s}");
    }
    if percent {
        s.push('%');
    }
    s
}
