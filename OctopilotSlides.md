# OctopilotSlides — Product & Architecture Document

> **Goal:** Build the world's best AI-powered presentation tool.  
> Beautiful on the web. Fully functional in PowerPoint. Driven by a true agentic AI.

---

## 1. Vision

Most AI slide tools (Gamma, Beautiful.ai, Tome) are **template-fillers** — the AI picks a layout and writes text. That's it.

OctopilotSlides is different:

- AI **thinks, plans, researches, and designs** — not just fills templates
- Every slide is individually crafted based on content, not picked from a library
- Animations and Morph transitions work **both in the browser and in exported .pptx**
- The AI can create, delete, redesign, and reorganize slides on its own initiative
- Research is grounded in real sources — same pipeline as Ghostwriter

**One sentence:** AI that designs slides the way a senior designer + researcher would, end to end.

---

## 2. Competitive Landscape

| Feature | Gamma | Beautiful.ai | Tome | PowerPoint Copilot | **OctopilotSlides** |
|---|---|---|---|---|---|
| Truly agentic AI | ❌ | ❌ | partial | ❌ | ✅ |
| Source-grounded research | ❌ | ❌ | ❌ | ❌ | ✅ |
| Full shape system | basic | template only | none | manual | ✅ SVG + DrawingML |
| Per-element animations | ❌ | limited | ❌ | manual | ✅ |
| Morph transition | ❌ | ❌ | ❌ | manual | ✅ |
| .pptx export (animations intact) | ❌ | partial | ❌ | native | ✅ |
| ask_user conversational flow | ❌ | ❌ | ❌ | ❌ | ✅ |
| Slide-level AI redesign | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 3. The Core Architecture Decision: Dual Renderer

This is the most important architectural choice. Everything else depends on it.

### The Problem

- Web rendering uses CSS/SVG — pixel-perfect, animatable, flexible
- PowerPoint uses DrawingML XML (EMU units, different animation model)
- If we design for web only → PPTX export breaks
- If we design for PPTX only → web experience is limited

### The Solution: JSON Slide Spec → Two Renderers

```
JSON Slide Spec  (single source of truth)
      │
      ├──→  SVG + HTML Renderer    →  Web canvas (preview, present)
      └──→  PptxGenJS Renderer     →  .pptx export (PowerPoint, Keynote)
```

The AI outputs a structured JSON spec. Two independent renderers consume it.  
Any feature added to the schema automatically works on both platforms — if designed within the constraints below.

### Coordinate System

Web uses percentages. PPTX uses EMU (English Metric Units).

```
1 inch        = 914,400 EMU
Slide width   = 9,144,000 EMU   (10 inches)
Slide height  = 5,143,500 EMU   (5.63 inches, 16:9)
```

All positions and sizes in the JSON spec are stored as **percentages (0–100)**.  
At render time: `x_emu = (x / 100) × 9,144,000`

This gives perfect fidelity across both renderers with simple math.

---

## 4. Slide Data Schema

Every slide is a JSON object. The AI outputs this. Both renderers consume it.

```typescript
type SlideSpec = {
  id: string                    // e.g. "slide_001"
  position: number              // order in deck
  layout: LayoutType
  background: Background
  elements: SlideElement[]
  transition?: TransitionSpec   // slide-level entrance transition
  speakerNotes?: string
}

type LayoutType =
  | "free"        // AI places everything manually (full control)
  | "hero"        // full-bleed image/bg, centered text
  | "split"       // left text, right visual
  | "columns"     // 2 or 3 equal columns
  | "timeline"    // horizontal or vertical steps
  | "title"       // title slide
  | "blank"       // no predefined structure

type Background =
  | { type: "solid";    color: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image";    src: string; overlay?: string; overlayOpacity?: number }

type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | IconElement
  | ChartElement    // Phase 2
  | VideoElement    // Phase 3
```

### TextElement

```typescript
type TextElement = {
  id: string               // "!!prefix" for Morph targeting
  type: "text"
  variant: "title" | "subtitle" | "body" | "caption" | "quote" | "label"
  content: string
  position: Rect           // { x, y, w, h } all in %
  style: {
    fontSize: number       // in pt
    fontWeight: 400 | 600 | 700 | 800
    fontFamily: string     // must be a system-safe font (see Font Map)
    color: string
    align: "left" | "center" | "right"
    italic?: boolean
    lineHeight?: number
  }
  animation?: AnimationSpec
}
```

### ShapeElement

```typescript
type ShapeElement = {
  id: string               // "!!prefix" for Morph targeting
  type: "shape"
  shape:
    | "rectangle"
    | "circle"
    | "oval"
    | "triangle"
    | "arrow"
    | "diamond"
    | "hexagon"
    | "parallelogram"
    | "speechBubble"
    | "star"
    | "line"
  position: Rect
  style: {
    fill: string           // hex color or "transparent"
    stroke?: string
    strokeWidth?: number
    opacity?: number
    cornerRadius?: number  // for rectangle
    rotation?: number      // degrees
  }
  animation?: AnimationSpec
}
```

### ImageElement

```typescript
type ImageElement = {
  id: string
  type: "image"
  src: string              // URL (will be fetched + embedded at export)
  sourceType: "unsplash" | "user_upload" | "ai_generated"
  position: Rect
  style: {
    objectFit: "cover" | "contain" | "fill"
    borderRadius?: number
    opacity?: number
  }
  animation?: AnimationSpec
}
```

### IconElement

```typescript
type IconElement = {
  id: string
  type: "icon"
  name: string             // Lucide icon name
  position: Rect
  style: {
    color: string
    size: number           // pt
  }
  animation?: AnimationSpec
}
```

### Rect

```typescript
type Rect = {
  x: number    // % from left
  y: number    // % from top
  w: number    // % of slide width
  h: number    // % of slide height
}
```

---

## 5. Animation System

### Design Principle

Animations are defined using **PPTX animation vocabulary as the base set**.  
The web renderer implements the same effects using GSAP / CSS.  
This guarantees .pptx export fidelity.

### AnimationSpec

```typescript
type AnimationSpec = {
  trigger: "entrance" | "exit" | "emphasis" | "onClick" | "withPrev" | "afterPrev"
  type: AnimationType
  direction?: "fromBottom" | "fromTop" | "fromLeft" | "fromRight"
  duration: number           // milliseconds
  delay: number              // milliseconds
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | "bounce"
  morphTargetId?: string     // for Morph — ID of matching element on next slide
}
```

### Animation Types (PPTX-compatible)

```
Entrance:   "appear" | "fade" | "flyIn" | "floatIn" | "zoomIn" | 
            "wipe" | "bounce" | "swivel" | "grow"

Exit:       "disappear" | "fadeOut" | "flyOut" | "zoomOut" | "collapse"

Emphasis:   "pulse" | "spin" | "teeter" | "flash" | "boldReveal" | "wiggle"
```

### Slide Transitions (TransitionSpec)

```typescript
type TransitionSpec = {
  type: "fade" | "push" | "wipe" | "zoom" | "split" | "morph" | "none"
  duration: number           // milliseconds
  direction?: "left" | "right" | "up" | "down"
}
```

### Morph — Flagship Feature

PowerPoint Morph animates objects between slides when they share the same name.

**Convention:**

```
Element ID must start with "!!"
Slide 1:  id = "!!hero_shape"  (circle, x:10, y:20)
Slide 2:  id = "!!hero_shape"  (rectangle, x:60, y:50, different color)

→ PowerPoint automatically morphs circle → rectangle, position, color
```

**PPTX XML required:**

```xml
<!-- On slide 2 transition -->
<p:transition>
  <p:morph origin="slide"/>
</p:transition>
```

**Web implementation:** Flubber.js (shape path interpolation) + GSAP Timeline  
**PPTX implementation:** `!!` naming + morph transition XML via PptxGenJS

---

## 6. Font Strategy

Google Fonts are not guaranteed to be installed on PowerPoint machines.  
All font choices must map to a safe system font.

### Font Map

```
Design Intent       Web Font (Google)    PPTX Safe Font
──────────────────────────────────────────────────────
Modern / Clean   →  Inter             →  Calibri
Professional     →  Source Sans Pro   →  Corbel
Editorial        →  Playfair Display  →  Georgia
Technical        →  JetBrains Mono    →  Courier New
Elegant          →  Cormorant         →  Garamond
Friendly         →  Nunito            →  Trebuchet MS
```

At PPTX export time, font names are substituted from the map.  
Web rendering uses the Google Font version for visual quality.

**Phase 2:** Embed `.ttf` files directly into PPTX via PptxGenJS font embedding.

---

## 7. Images

### Source Priority

```
1.  Unsplash API      free, high quality, keyword search
2.  Pexels API        backup / alternative style
3.  DALL-E / Flux     AI-generated for specific/abstract needs
4.  User upload       PDF, PNG, JPG via sidebar
```

### Unsplash Integration

AI calls `fetch_image` tool with a semantic query:

```json
{
  "source": "unsplash",
  "query": "tropical flooding city aerial view",
  "orientation": "landscape",
  "mood": "dramatic"
}
```

At PPTX export: images are fetched server-side and embedded as base64.  
Web rendering: URL used directly.

---

## 8. Agentic Workflow

### Agent Architecture

No LangGraph. No external orchestration framework.

Stack: **Claude API (tool_use) + custom SlidesOrchestrator** — same pattern as `GhostwriterOrchestrator`.

Loop:

```
User sends message
        ↓
Claude API call (tools enabled + extended thinking)
        ↓
AI outputs tool_use block
        ↓
Server executes tool → result
        ↓
Result sent back to Claude (next turn)
        ↓
Repeat until AI returns plain text (done) or asks user
```

### The 9 Tools

#### `analyze_instruction`
Input: raw user instruction text  
Output: `{ topic, audience, tone, complexity, suggestedSlideCount, keyThemes[] }`  
Purpose: AI understands what it's building before making any slides.

#### `ask_user`
Input: `{ question: string, field: string, inputType: "text" | "number" | "choice", suggestions?: string[] }`  
Output: user's answer  
Purpose: AI asks for missing info — slide count, style preference, company name, etc.  
Used when: slide count not given, tone unclear, critical info missing.

#### `create_slides`
Input: `{ count: number, titles?: string[] }`  
Output: `{ slides: { id: string, position: number, status: "blank" }[] }`  
Purpose: Scaffolds the deck with blank slides + unique IDs.  
Frontend: renders blank frames on canvas immediately.

#### `delete_slide`
Input: `{ id: string, reason: string }`  
Output: confirmation  
Purpose: AI can remove a slide it decides is redundant after writing.

#### `search_source`
Input: `{ query: string, maxResults: number }`  
Output: `{ results: { title, url, snippet }[] }`  
Purpose: Web research grounding content in real sources.  
Same pipeline as Ghostwriter's source search.

#### `analyze_source`
Input: `{ url: string, focusTopics: string[] }`  
Output: `{ facts: string[], quotes: string[], data: Record<string, unknown>[] }`  
Purpose: Extracts structured knowledge from a source page.

#### `write_slide`
Input: `{ id: string, topic: string, position: "intro"|"body"|"conclusion"|"data", sources: string[] }`  
Output: `{ title: string, bullets: string[], quote?: string, speakerNotes: string }`  
Purpose: Writes the content for one slide, grounded in sources.

#### `design_slide`
Input: `{ id: string, content: SlideContent, deckTheme: ThemeSpec, position: number, totalSlides: number }`  
Output: Full `SlideSpec` JSON (layout, background, elements[], animations[])  
Purpose: The AI's visual design brain. Decides layout, shapes, image placement, element animations, typography, Morph IDs.

#### `compose`
Input: `{ deckId: string, slides: SlideSpec[] }`  
Output: `{ exportSnapshot: ExportDeckSnapshot }`  
Purpose: Final assembly. Validates the deck, resolves all image URLs, prepares export snapshot.

---

## 9. Workflow Sequence

```
User types: "Climate change impacts on SE Asia, board presentation, professional"

Step 1 — analyze_instruction
  → { topic, audience:"board", tone:"professional", complexity:"medium" }

Step 2 — ask_user
  → "How many slides would you like? (Recommended: 8–10 for a board deck)"
  User: "9"

Step 3 — create_slides (count: 9)
  → slide_001 … slide_009 (blank, IDs assigned)
  → Frontend: 9 blank frames appear on canvas

Step 4 — search_source (2–3 queries in sequence)
  → results from web

Step 5 — analyze_source (per result)
  → structured facts, data, quotes

Step 6 — write_slide (per slide, sequential)
  → slide_001: { title: "The Climate Crisis", bullets: [...] }
  → Frontend: slide updates live as each one is written

Step 7 — design_slide (per slide, sequential)
  → slide_001: full SlideSpec with layout, bg, elements, animations
  → Frontend: slide renders fully on canvas

Step 8 — compose
  → final deck snapshot
  → Frontend: Export button activates
```

Frontend receives real-time updates via **SSE** (same as Ghostwriter pattern).  
Each tool completion emits an event → canvas updates live.

---

## 10. Design Intelligence Rules

The AI prompt for `design_slide` must internalize these rules to produce frontier-quality output:

### Layout Selection

```
Title slide          →  "hero" layout, full-bleed dark bg, centered white text
Comparison           →  "columns" layout, contrasting accent per column
Process / Steps      →  "timeline" layout, numbered shapes
Key statistic        →  "hero" layout, large number as focal point, minimal elements
Quote                →  "blank" layout, large italic text, accent bar left
Section break        →  Bold typographic slide, geometric shape as accent
Body content         →  "split" layout — text left, relevant image right
List heavy           →  "free" layout, max 4 bullets, icon per bullet
```

### Visual Hierarchy

```
Title:    48–60pt, fontWeight 700–800
Subtitle: 24–32pt, fontWeight 400–500, opacity 70%
Body:     16–20pt, fontWeight 400, opacity 60%
Caption:  12–14pt, fontWeight 400, opacity 40%
```

### Composition Rules

```
• 40%+ white space on every slide — slides that breathe win
• Max 3 colors: background + text + one accent
• Images anchored to edges (full bleed right or left) — never floating small
• Shapes as atmosphere (large, low opacity bg elements) not decoration
• Max 4 bullet points — if more, break into another slide
• Numbers > text — "73%" as hero beats "seventy-three percent"
```

### Morph Continuity

```
• Assign "!!" IDs to hero elements that persist across slides
• Example: title text on slide 1 → "!!main_title"
           same element repositioned on slide 2 → Morph handles transition
• Use Morph to create narrative continuity (element "travels" through deck)
```

---

## 11. .pptx Export

### Library: PptxGenJS

```
Node.js / Next.js compatible
Outputs: .pptx buffer (downloadable)
Supports: shapes, text, images (embedded), transitions, animations
```

### Export Pipeline

```
POST /api/slides/export
  ↓
Load SlideSpec[] from server state (or Firestore Phase 2)
  ↓
PptxGenJS Renderer
  ├── For each slide:
  │   ├── addSlide()
  │   ├── addTransition({ type, duration })
  │   ├── For each element:
  │   │   ├── addShape() / addText() / addImage() / addChart()
  │   │   └── addAnimation({ type, trigger, duration, delay })
  │   └── addSpeakerNotes()
  ↓
Images: fetch URLs → base64 embed (server-side)
Fonts: substitute via Font Map
Morph: !! element names preserved → morph transition set
  ↓
.pptx buffer → res.download()
```

### Fidelity Table

```
Feature                    PPTX Fidelity
──────────────────────────────────────────────────────
Shapes (basic)             ✅  100%
Text + formatting          ✅  100% (with font map)
Images (embedded)          ✅  100%
Slide transitions          ✅  100%
Element animations         ✅  ~95% (PPTX-vocab animations)
Morph                      ✅  100% (!! naming + morph XML)
Google Fonts               ⚠️   System font substitution
Complex SVG paths          ⚠️   Basic shapes only (Phase 1)
CSS box-shadow             ⚠️   PPTX glow effect (approximate)
Video backgrounds          ❌  Phase 3
```

---

## 12. State Management

### Phase 1 (MVP)

Server-side in-memory: `Map<runId, DeckState>`  
Same pattern as Ghostwriter.  
Slides lost on server restart.

### Phase 2 (Production)

Firestore: `decks/{deckId}/slides/{slideId}`  
User can close browser and return to deck.  
Multiple devices, version history.

### DeckState Shape

```typescript
type DeckState = {
  deckId: string
  runId: string
  status: "running" | "complete" | "error" | "waiting_for_user"
  slides: SlideSpec[]
  sources: SourceItem[]
  pendingQuestion: AgentQuestion | null
  exportSnapshot: ExportDeckSnapshot | null
  createdAt: number
  updatedAt: number
}
```

---

## 13. Frontend — OctopilotSlidesView

### Layout

```
Fixed header (AppHeader)
  ↓
Left Sidebar [320px]          Main Canvas [flex-1]
  ├── Mode header              ├── Toolbar (zoom, fit, theme, export)
  ├── Workflow / Sources tabs  ├── Infinite canvas (pan + zoom)
  ├── Step list (live)         │   ├── Dot-grid background
  ├── Sources (post-research)  │   ├── Slide frames (SVG rendered)
  └── Chat + input box         └── Thumbnail strip (horizontal)
```

### Canvas Interactions

```
Left-click drag          →  pan canvas
Scroll (trackpad)        →  pan (deltaX / deltaY)
Ctrl + scroll / pinch    →  zoom centered on cursor
Click slide              →  focus + zoom to slide, set active
"Fit" button             →  fit all slides in viewport
+/- buttons              →  step zoom ±10%
```

### Real-time SSE Events (sidebar + canvas)

```
workflow_step     { stepId, status }           →  step indicator update
slide_created     { id, position }             →  blank frame appears on canvas
slide_written     { id, content }              →  text appears in slide
slide_designed    { id, spec: SlideSpec }      →  slide fully renders
source_found      { title, url }               →  sources tab populates
ask_user          { question, field, type }    →  chat input activates with prompt
workflow_complete { deckId }                   →  export button activates
```

---

## 14. Tech Stack

```
Frontend       Next.js 16, React 19, Tailwind CSS v4, TypeScript
Rendering      SVG + HTML (web preview)
Animations     GSAP (web), PptxGenJS (export)
Morph          Flubber.js (shape interpolation, web) + !! naming (PPTX)
PPTX Export    PptxGenJS
Images         Unsplash API + server-side fetch for embed
Icons          Lucide React (already installed)
AI             Claude API (tool_use + extended thinking)
Streaming      SSE (same as Ghostwriter)
State (MVP)    Server in-memory Map
State (Prod)   Firestore
Auth           Firebase (existing)
```

---

## 15. Build Phases

### Phase 1 — MVP (Core)

```
[ ] JSON Slide Spec schema (TypeScript types)
[ ] SVG/HTML web renderer
[ ] Thumbnail renderer (scaled)
[ ] Infinite canvas (pan + zoom) — done ✅
[ ] Basic shapes: rect, circle, triangle, oval
[ ] Text elements
[ ] Image elements (Unsplash URL)
[ ] SlidesOrchestrator (agent loop)
[ ] Tools: analyze_instruction, ask_user, create_slides, write_slide, design_slide, compose
[ ] SSE streaming to frontend
[ ] Basic transitions: fade, push (PPTX + web)
[ ] PptxGenJS export (shapes + text + images)
[ ] Font map (web → system)
```

### Phase 2 — Power

```
[ ] search_source + analyze_source tools
[ ] fetch_image tool (Unsplash API)
[ ] Per-element animations (fly-in, fade, zoom)
[ ] Morph transition (!! naming + Flubber.js + GSAP)
[ ] Advanced shapes: diamond, hexagon, arrow, speech bubble, star
[ ] Custom path shapes
[ ] Google Font embedding in PPTX
[ ] Firestore persistence
[ ] Speaker notes in export
[ ] delete_slide tool
```

### Phase 3 — Frontier

```
[ ] AI-generated images (DALL-E / Flux via fetch_image)
[ ] Charts (bar, pie, line) — D3 or Recharts + PPTX chart XML
[ ] Video backgrounds
[ ] Complex emphasis animations (teeter, bold reveal)
[ ] Motion path animations
[ ] Deck themes (AI picks from theme library)
[ ] Collaborative editing (multi-user canvas)
[ ] Present mode (full-screen browser presentation)
[ ] Slide notes view (presenter mode)
[ ] Version history
```

---

## 16. Open Questions

```
Q1: Image generation model — DALL-E 3 vs Flux Schnell vs Ideogram?
    (Cost, quality, speed tradeoff)

Q2: Unsplash API key — free tier limits (50 req/hour for demo)
    Need production key for scale.

Q3: Morph on web — Flubber.js vs GSAP MorphSVG plugin (paid)?
    Flubber is free, open source, handles shape interpolation well.

Q4: PptxGenJS font embedding — test with custom .ttf files
    Verify it works cleanly in current Next.js build.

Q5: Slide count limit — what's reasonable per run?
    MVP: 15 slides max. Production: unlimited with streaming.

Q6: ask_user — inline in chat or modal overlay?
    Decision: inline in chat (consistent with Ghostwriter pattern).
```

---

*Last updated: 2026-04-26*  
*Status: Architecture & Design Phase — no code written yet*
