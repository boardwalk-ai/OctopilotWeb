//! Octopilot Presentation Engine.
//!
//! `parse` turns a PPTX into a resolved scene graph; `play` is the presentation
//! state machine (steps, transitions, Morph, entrance effects) and produces a
//! frame of draw commands for any moment in time; the wasm module paints those
//! on a Canvas2D context.

pub mod model;
pub mod chart;
pub mod parse;
pub mod play;
#[cfg(target_arch = "wasm32")]
pub mod web;

pub use parse::parse_deck;
