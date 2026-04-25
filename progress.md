# OctopilotSlides — Build Progress

> Cross-referenced against `OctopilotSlides.md`  
> Last updated: 2026-04-26

---

## Overall Status

```
Phase 1 (MVP)     ████████░░░░░░░░░░░░  5 / 18 done   ~28%
Phase 2 (Power)   ░░░░░░░░░░░░░░░░░░░░  0 / 21 done
Phase 3 (Frontier)░░░░░░░░░░░░░░░░░░░░  0 / 9 done
```

---

## ✅ Done

### Architecture & Documentation
- [x] `OctopilotSlides.md` — full product + architecture document (20 sections)
- [x] Color Theme System spec — 10 named palettes, semantic roles, ask_user flow
- [x] Creative Engine spec — Manifesto, Designer Persona, 8 Archetypes, Flashy Toolkit, Animation Philosophy
- [x] Feature Roadmap — Brand Kit, Slides from Anything, Morph Narrative, AI Deck Review, Audience Mode, Presenter Mode
- [x] Element ID Convention spec — `{slideId}_{role}_{index}` + `!!` morph prefix
- [x] 16-tool list with full input/output specs

### Methodology Page
- [x] `MethodologyView.tsx` — redesigned with RadialOrbitalTimeline
- [x] OctopilotSlides mode added (email-gated: dev.trhein@gmail.com)
- [x] Violet → red color theme corrected

### Routing
- [x] `HomeView.tsx` — `octopilotslides` added to `Page` union, routing to `OctopilotSlidesView`
- [x] `OrganizerService.ts` — `"octopilotslides"` added to `writingMode` type
- [x] `TrackerService.ts` — `"octopilotslides"` added to `WritingMode` type
- [x] `StepperHeader.tsx` — type updated

### Chunk A — TypeScript Types (`src/types/slides.ts`) ✅
- [x] `Rect` — % coordinate system
- [x] `Background` — solid / gradient / image+overlay
- [x] `AnimationSpec` + all animation types (PPTX-vocabulary: entrance, exit, emphasis)
- [x] `TransitionSpec` — fade, push, wipe, zoom, split, morph, none
- [x] `TextElement`, `ShapeElement`, `ImageElement`, `IconElement`, `SlideElement`
- [x] `TextStyle`, `ShapeStyle`, `ImageStyle`, `IconStyle`
- [x] `SlideSpec` — with `archetype` + `designIntent` fields
- [x] `DesignArchetype` — 8 types
- [x] `DesignVoice` — 8 types
- [x] `LayoutType`, `TextVariant`, `ShapeType`
- [x] `DeckTheme` + `FontChoice`
- [x] `BUILT_IN_THEMES` — all 10 palettes with hex + typography
- [x] `FONT_MAP` — Google Font → PPTX system font
- [x] `getThemeByName()`, `toPptxFont()` helpers
- [x] `DeckState`, `DeckStatus`, `AgentQuestion`, `SourceItem`
- [x] `SlidesSSEEvent` — 11 event variants
- [x] `applyElementPatch()`, `applySlideUpsert()`, `applyElementRemove()`, `applyElementAdd()`

### Chunk B — Web Renderer (`src/components/slides/`) ✅
- [x] `SlideCanvas.tsx` — renders `SlideSpec` at any pixel width (scale = width/880)
- [x] Background rendering — solid, gradient, image+overlay
- [x] `TextEl.tsx` — font, weight, color, align, italic, underline, strikethrough, lineHeight, letterSpacing, opacity
- [x] `ShapeEl.tsx` — 11 SVG shapes: rectangle, circle, oval, triangle, diamond, line, arrow, star, hexagon, parallelogram, speechBubble
- [x] `ImageEl.tsx` — objectFit (cover/contain/fill), borderRadius, opacity, rotation
- [x] `IconEl.tsx` — dynamic Lucide icon resolver by name string
- [x] Selection handles — red ring + 4 corner dots on selected element
- [x] `SlideThumbnail.tsx` — scaled mini preview (scale = thumbWidth/880)
- [x] `index.ts` — barrel exports

### Canvas & UI (`src/views/OctopilotSlidesView.tsx`) ✅
- [x] Infinite canvas — pan + zoom
- [x] Non-passive wheel listener (zoom centered on cursor)
- [x] Drag to pan (H mode)
- [x] Canvas mode toggle H / V (keyboard H, V, Escape + toolbar button)
- [x] Element selection (V mode — click → selectedElementId, click bg → deselect)
- [x] `focusSlide()` — smooth pan+zoom to any slide
- [x] Fit view button
- [x] Thumbnail strip with real `SlideThumbnail`
- [x] Zoom controls (−/+/display)
- [x] Theme swatch in toolbar (name + primary color dot)
- [x] Sidebar — workflow steps + sources tabs
- [x] Chat UI (messages, input, send)
- [x] Workflow animation (mock steps with timers)
- [x] 6 demo slides using real `SlideSpec` — all 6 archetypes represented

---

## 🔄 In Progress

Nothing currently in progress.

---

## ⏳ Phase 1 — Remaining

### Chunk C — AI Agent (next up)

- [ ] `src/server/slides/agent/systemPrompt.ts` — Designer Persona + all creative rules
- [ ] `src/server/slides/agent/loop.ts` — SlidesOrchestrator (adapted from Ghostwriter loop.ts)
- [ ] `src/server/slides/agent/runs.ts` — DeckRun type + in-memory `Map<runId, DeckState>`
- [ ] `src/server/slides/agent/tools/analyze_instruction.ts`
- [ ] `src/server/slides/agent/tools/ask_user.ts`
- [ ] `src/server/slides/agent/tools/create_slides.ts`
- [ ] `src/server/slides/agent/tools/write_slide.ts`
- [ ] `src/server/slides/agent/tools/design_slide.ts` ← most complex, calls Claude Opus
- [ ] `src/server/slides/agent/tools/compose.ts`
- [ ] `src/server/slides/agent/tools/update_deck_theme.ts`
- [ ] `src/server/slides/agent/tools/update_element.ts`
- [ ] `src/server/slides/agent/tools/add_element.ts`
- [ ] `src/server/slides/agent/tools/remove_element.ts`
- [ ] `src/app/api/slides/start/route.ts` — POST: start run → SSE stream
- [ ] `src/app/api/slides/answer/route.ts` — POST: reply to ask_user question
- [ ] SSE streaming — `SlidesSSEEvent` events to frontend

### Chunk D — Property Panel (V mode editing)

- [ ] Property panel component (right sidebar, appears on element select)
  - [ ] Text properties: font family, size, weight, color, align, italic, underline
  - [ ] Shape properties: fill, stroke, strokeWidth, opacity, cornerRadius, rotation
  - [ ] Image properties: objectFit, opacity, borderRadius
  - [ ] Position/size panel: X, Y, W, H (all %)
  - [ ] Animation panel: trigger, type, direction, duration, delay
- [ ] Font dropdown with Google Fonts list
- [ ] Color picker (hex input + swatch)
- [ ] Wire `onChange` → `applyElementPatch()` → re-render

### Chunk E — Export

- [ ] `npm install pptxgenjs`
- [ ] `src/server/slides/export/pptxRenderer.ts` — `SlideSpec[]` → `.pptx` buffer
  - [ ] Text rendering (with FONT_MAP substitution)
  - [ ] Shape rendering (basic shapes)
  - [ ] Image rendering (server-side fetch → base64 embed)
  - [ ] Slide transitions: fade, push
  - [ ] Speaker notes
- [ ] `src/app/api/slides/export/route.ts` — GET: return .pptx download

### Remaining Phase 1 items

- [ ] Basic transitions: fade, push (web CSS + PptxGenJS)
- [ ] Font loading — Google Fonts CSS import for theme fonts
- [ ] Connect real agent to `OctopilotSlidesView` (replace mock workflow)
- [ ] Connect SSE events to canvas (live slide appear/update during generation)

---

## ⏳ Phase 2 — Not Started

- [ ] `search_source` + `analyze_source` tools (web research pipeline)
- [ ] `fetch_image` tool (Unsplash API integration)
- [ ] GSAP animations in web renderer (per-element entrance/exit/emphasis)
- [ ] Animation export in PptxGenJS
- [ ] Smart animation choreography (narrative-aware timing in system prompt)
- [ ] Morph transition — Flubber.js (web) + `!!` naming XML (PPTX)
- [ ] `plan_morph_story` tool — Morph Narrative Planning (Feature 3)
- [ ] Advanced shapes (already in ShapeEl SVG, need Phase 2 exposure)
- [ ] `reorder_slides` + `update_slide_background` tools
- [ ] "AI Assist" button in property panel
- [ ] Inline text editing (double-click on TextEl)
- [ ] Undo / Redo command stack
- [ ] Keyboard shortcuts (Ctrl+B/I/U/Z)
- [ ] Google Font embedding in PPTX (.ttf embed)
- [ ] Firestore persistence (replace in-memory Map)
- [ ] Speaker notes view in UI
- [ ] Brand Kit — `BrandKit` type + `update_brand_kit` tool (Feature 1)
- [ ] Slides from Anything — `ingest_source` tool URL/PDF/DOCX (Feature 2)
- [ ] AI Deck Review — `review_deck` tool + feedback panel (Feature 4)
- [ ] Audience Mode — `AudienceMode` versioning (Feature 5)
- [ ] Presenter Mode — `/present/[deckId]` route (Feature 6)

---

## ⏳ Phase 3 — Not Started

- [ ] AI-generated images (DALL-E / Flux)
- [ ] Charts (bar, pie, line) — D3 + PPTX chart XML
- [ ] Video backgrounds
- [ ] Complex emphasis animations (teeter, bold reveal, motion path)
- [ ] Collaborative editing (multi-user)
- [ ] Version history + deck snapshots
- [ ] Export to PDF (jsPDF)
- [ ] Multi-select + group editing
- [ ] Google Slides export

---

## File Map

```
src/
├── types/
│   └── slides.ts                    ✅ complete
│
├── components/
│   └── slides/
│       ├── index.ts                 ✅ barrel
│       ├── SlideCanvas.tsx          ✅ complete
│       ├── SlideThumbnail.tsx       ✅ complete
│       └── elements/
│           ├── TextEl.tsx           ✅ complete
│           ├── ShapeEl.tsx          ✅ complete
│           ├── ImageEl.tsx          ✅ complete
│           └── IconEl.tsx           ✅ complete
│
├── views/
│   ├── OctopilotSlidesView.tsx      ✅ canvas + UI (mock data)
│   └── MethodologyView.tsx          ✅ updated
│
└── server/
    └── slides/                      ⏳ not started
        ├── agent/
        │   ├── loop.ts              ⏳
        │   ├── runs.ts              ⏳
        │   ├── systemPrompt.ts      ⏳
        │   └── tools/               ⏳ (13 tools)
        └── export/
            └── pptxRenderer.ts      ⏳

src/app/api/
    └── slides/                      ⏳ not started
        ├── start/route.ts           ⏳
        ├── answer/route.ts          ⏳
        └── export/route.ts          ⏳
```

---

## What Works Right Now

If you open OctopilotSlides today (as dev.trhein@gmail.com):

- ✅ Methodology page shows OctopilotSlides node in the orbital UI
- ✅ Clicking "Get Started" routes to the OctopilotSlidesView
- ✅ 6 demo slides render correctly using real `SlideSpec` data
- ✅ Infinite canvas — drag to pan, Ctrl+scroll to zoom, Fit button
- ✅ H/V mode toggle (keyboard H/V/Esc + toolbar)
- ✅ Thumbnail strip shows real mini renders of each slide
- ✅ Theme name + color swatch in toolbar
- ✅ Sidebar with workflow steps + sources + chat
- ✅ Mock workflow animation (simulates AI running steps)
- ❌ No real AI yet — agent not built
- ❌ No export yet — PptxGenJS not integrated
- ❌ No property panel yet — element editing not wired

---

## Next Session Starts Here

**Chunk C: SlidesOrchestrator**

1. `src/server/slides/agent/systemPrompt.ts` — Creative Engine system prompt
2. `src/server/slides/agent/runs.ts` — DeckState in-memory store
3. `src/server/slides/agent/loop.ts` — agent loop (adapt from Ghostwriter loop.ts)
4. Tools: `analyze_instruction` → `ask_user` → `create_slides` → `write_slide` → `design_slide` → `compose`
5. `src/app/api/slides/start/route.ts` — SSE endpoint
6. `src/app/api/slides/answer/route.ts` — ask_user reply
7. Wire frontend: replace mock `runWorkflow()` with real SSE consumer
```

---

*progress.md — auto-synced with OctopilotSlides.md*  
*Update this file after each coding session.*
