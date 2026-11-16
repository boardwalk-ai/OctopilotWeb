#!/bin/sh
# Builds the Octopilot Presentation Engine to public/octo-present (committed, so deploys need no Rust).
# Needs: rustup target add wasm32-unknown-unknown ; cargo install wasm-bindgen-cli --version 0.2.100 --locked
set -eu
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir ../../public/octo-present target/wasm32-unknown-unknown/release/octo_present.wasm
ls -la ../../public/octo-present
