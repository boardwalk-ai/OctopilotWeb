# OctopilotSlides — Product & Architecture Document

> **Goal:** Build the world's best AI-powered presentation tool.  
> Beautiful on the web. Fully functional in PowerPoint. Driven by a true agentic AI.  
> **Brand line: Everything customizable + AI assist.**

---

## 1. Vision

Most AI slide tools (Gamma, Beautiful.ai, Tome) are **template-fillers** — the AI picks a layout and writes text. That's it.

OctopilotSlides is different:

- AI **thinks, plans, researches, and designs** — not just fills templates
- Every slide is individually crafted based on content, not picked from a library
- Animations and Morph transitions work **both in the browser and in exported .pptx**
- The AI can create, delete, redesign, and reorganize slides on its own initiative
- Research is grounded in real sources — same pipeline as Ghostwriter
- **User can manually edit every single property** — font, size, color, shape, animation — directly on the canvas
- **AI can also edit every single property** — user says "make this bolder" → AI calls the right tool

**One sentence:** AI that designs slides the way a senior designer + researcher would — and then hands full creative control back to the user.

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
| Full manual element editing | ❌ | limited | ❌ | ✅ | ✅ |
| AI element-level editing | ❌ | ❌ | ❌ | ❌ | ✅ |

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
User and AI edits both write to this same spec — it is the single source of truth.

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
    color: string          // hex
    align: "left" | "center" | "right" | "justify"
    italic?: boolean
    underline?: boolean
    strikethrough?: boolean
    lineHeight?: number
    letterSpacing?: number // em
    opacity?: number       // 0–1
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
    opacity?: number
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

## 8. AI + User Editing Model ("Everything Customizable + AI Assist")

This is Octopilot's brand promise — both AI and users can edit everything, down to individual element properties.

### One State, Two Editors

```
JSON Slide Spec  ←─────────────  Source of Truth
      ↑                                ↑
      │                                │
User edits                       AI edits
(canvas click                    (tool calls via
 → property panel)                chat / auto)

Both write to the same spec.
Renderer re-renders immediately.
PPTX export always reflects latest state.
```

### Canvas Modes (Figma-style)

```
H  —  Hand / Navigate mode   (default)
       drag = pan canvas
       scroll = zoom

V  —  Select / Edit mode
       click element = select + show handles
       drag element = move / resize
       double-click text = inline edit
```

Toggle via toolbar button or keyboard shortcuts `H` / `V`.

### User Edit Flow

```
User switches to Select mode (V)
        ↓
Clicks on an element
        ↓
Element shows selection handles (corners + border)
        ↓
Properties panel appears (right sidebar or floating):

  ┌────────────── TEXT ───────────────┐
  │  Font      [Inter          ▾]     │
  │  Size      [48  ] pt              │
  │  Weight    [B] [I] [U] [S]        │
  │  Color     [████]  #ffffff        │
  │  Align     [◀] [▌] [▶] [⬛]      │
  │  Opacity   ──────●──  90%         │
  │  Line H    [1.5 ] ×               │
  │  Spacing   [0.02] em              │
  ├────────────── POSITION ───────────┤
  │  X [5%]  Y [20%]                  │
  │  W [48%] H [25%]  🔒              │
  ├────────────── ANIMATION ──────────┤
  │  Type    [Fly In        ▾]        │
  │  Dir     [From Bottom   ▾]        │
  │  Duration [400] ms  Delay [200]ms │
  ├────────────── AI ASSIST ──────────┤
  │  ✦ [Make bolder] [Suggest color]  │
  │  ✦ Type: ________________________ │
  └───────────────────────────────────┘

User changes fontSize 48 → 64
        ↓
SlideSpec JSON: element.style.fontSize = 64
        ↓
Canvas re-renders instantly
        ↓
PPTX export reflects change automatically
```

### AI Edit Flow (Same State)

```
User: "Slide 3 ရဲ့ title ကို bold red ပြောင်းပေး"
        ↓
AI extended thinking:
  → slide_003, element id "!!stat_hero"
  → changes: { fontWeight: 800, color: "#ef4444" }
        ↓
AI calls: update_element({
  slideId: "slide_003",
  elementId: "!!stat_hero",
  changes: { fontWeight: 800, color: "#ef4444" }
})
        ↓
SlideSpec JSON updates
        ↓
SSE event → frontend re-renders live
```

### Property Panel — Full List

**Text:**
- Font family (dropdown — Google Fonts mapped to system)
- Font size (pt)
- Font weight (regular / medium / semibold / bold / extrabold)
- Italic, Underline, Strikethrough toggles
- Text color (color picker + hex)
- Opacity (slider 0–100%)
- Alignment (left / center / right / justify)
- Line height (multiplier)
- Letter spacing (em)

**Shape:**
- Fill color
- Stroke color + width
- Corner radius (rect only)
- Opacity
- Rotation (degrees)

**Image:**
- Object fit (cover / contain / fill)
- Opacity
- Border radius

**All elements:**
- Position X / Y (%)
- Size W / H (%)
- Lock aspect ratio toggle
- Rotation

**Animation:**
- Trigger (entrance / exit / emphasis / onClick)
- Type (dropdown of PPTX-compatible types)
- Direction
- Duration (ms)
- Delay (ms)

---

## 9. Agentic Workflow

### Agent Architecture

No LangGraph. No external orchestration framework.

Stack: **OpenRouter → Claude Opus (primary model) + custom SlidesOrchestrator**

The orchestrator directly reuses existing Ghostwriter infrastructure:

```
Reused as-is:
  src/server/ghostwriter/shared/openrouter.ts   ← JSON call helper
  src/server/backendConfig.ts                   ← getOpenRouterConfig("primary")
  src/server/ghostwriter/agent/runs.ts          ← AgentRun + SSE emit
  src/server/ghostwriter/agent/tools.ts         ← toOpenRouterToolSpec()

New (slides-specific):
  src/server/slides/agent/loop.ts               ← SlidesAgent loop
  src/server/slides/agent/tools/               ← 15 tool implementations
  src/server/slides/agent/runs.ts              ← DeckRun + DeckState
  src/server/slides/agent/systemPrompt.ts      ← design intelligence rules
  src/app/api/slides/start/route.ts            ← SSE endpoint
  src/app/api/slides/answer/route.ts           ← ask_user reply
  src/app/api/slides/export/route.ts           ← PPTX download
```

### OpenRouter Tool Format

OpenRouter uses **OpenAI-compatible function calling** — not Anthropic native format.

```typescript
// Tool spec sent to OpenRouter:
{
  type: "function",
  function: {
    name: "design_slide",
    description: "...",
    parameters: { /* JSON Schema */ }
  }
}

// AI response tool call:
{
  type: "function",
  function: {
    name: "design_slide",
    arguments: "{\"id\":\"slide_001\", ...}"  // ← JSON string, must parse
  }
}

// Tool result message:
{
  role: "tool",
  tool_call_id: "call_abc123",
  content: "{\"status\":\"ok\"}"
}
```

### Agent Loop (Simplified)

```
messages = [system, user_brief]
loop until done:
  response = callOpenRouter(messages, toolSpecs)
  
  if response.tool_calls is empty:
    if deck is complete → emit done, break
    else nudge model → "Continue — call the next tool"
  
  for each tool_call in response.tool_calls:
    result = executeTool(tool_call)
    messages.push(tool result)
    emit SSE event to frontend
```

Cost cap, max steps, dedup guard — same as Ghostwriter loop.ts.

---

## 10. Complete Tool List (15 tools)

### Generation tools

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `analyze_instruction` | raw instruction text | `{ topic, audience, tone, complexity, suggestedCount, keyThemes[] }` | Understand the brief |
| `ask_user` | `{ question, field, inputType, suggestions? }` | user answer | Ask slide count, style, company name etc. |
| `create_slides` | `{ count, titles? }` | `{ slides: { id, position }[] }` | Scaffold blank deck |
| `delete_slide` | `{ id, reason }` | confirmation | Remove redundant slide |
| `search_source` | `{ query, maxResults }` | `{ results: { title, url, snippet }[] }` | Web research |
| `analyze_source` | `{ url, focusTopics[] }` | `{ facts[], quotes[], data[] }` | Extract knowledge |
| `fetch_image` | `{ source, query, orientation, mood }` | `{ url, credit }` | Get Unsplash / AI image |
| `write_slide` | `{ id, topic, position, sources[] }` | `{ title, bullets[], quote?, speakerNotes }` | Write slide content |
| `design_slide` | `{ id, content, deckTheme, position, totalSlides }` | Full `SlideSpec` JSON | Visual design per slide |
| `compose` | `{ deckId, slides[] }` | `{ exportSnapshot }` | Final assembly |

### Edit tools (user + AI both use these)

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `update_element` | `{ slideId, elementId, changes: Partial<ElementStyle> }` | updated element | Change font, color, size, animation etc. |
| `add_element` | `{ slideId, element: SlideElement }` | updated slide | Add new element to existing slide |
| `remove_element` | `{ slideId, elementId }` | confirmation | Delete an element |
| `reorder_slides` | `{ slideId, newPosition }` | updated deck order | Move slides |
| `update_slide_background` | `{ slideId, background: Background }` | updated slide | Change bg color/gradient/image |

---

## 11. Workflow Sequence

```
User types: "Climate change impacts on SE Asia, board presentation, professional"

Step 1 — analyze_instruction
  → { topic, audience:"board", tone:"professional", complexity:"medium" }

Step 2 — ask_user
  → "How many slides would you like? (Recommended: 8–10 for a board deck)"
  User: "9"

Step 3 — create_slides (count: 9)
  → slide_001 … slide_009 (blank, IDs assigned)
  → Frontend: 9 blank frames appear on canvas immediately

Step 4 — search_source (2–3 queries)
  → web results

Step 5 — analyze_source (per result)
  → structured facts, data, quotes

Step 6 — write_slide (per slide, sequential)
  → slide_001: { title, bullets, speakerNotes }
  → Frontend: slide text appears live

Step 7 — fetch_image + design_slide (per slide)
  → slide_001: full SlideSpec (layout, bg, elements, animations, !! IDs)
  → Frontend: slide fully renders on canvas

Step 8 — compose
  → final deck snapshot
  → Frontend: Export button activates, "AI Assist" available on all elements
```

---

## 12. Design Intelligence Rules

The system prompt for `design_slide` must internalize these rules:

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
• Title on slide 1 → "!!main_title" — same ID on slide 2 triggers Morph
• Use Morph to create narrative continuity (element "travels" through deck)
```

---

## 13. .pptx Export

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
Morph: !! element names preserved → morph transition XML injected
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
User manual edits          ✅  100% (same spec → same export)
Google Fonts               ⚠️   System font substitution
Complex SVG paths          ⚠️   Basic shapes only (Phase 1)
CSS box-shadow             ⚠️   PPTX glow effect (approximate)
Video backgrounds          ❌  Phase 3
```

---

## 14. State Management

### Edit State — How User + AI Edits Work Together

```typescript
// Every edit (user or AI) calls this same function:
function applyElementPatch(
  state: DeckState,
  slideId: string,
  elementId: string,
  changes: Partial<TextStyle | ShapeStyle | ImageStyle>
): DeckState {
  return {
    ...state,
    slides: state.slides.map(slide =>
      slide.id !== slideId ? slide : {
        ...slide,
        elements: slide.elements.map(el =>
          el.id !== elementId ? el : { ...el, style: { ...el.style, ...changes } }
        )
      }
    )
  }
}
// User edit: call directly from property panel onChange
// AI edit:   call from update_element tool handler → emit SSE → frontend updates
```

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

## 15. Frontend — OctopilotSlidesView

### Layout

```
Fixed header (AppHeader, height 64px)
  ↓
Left Sidebar [320px]              Main Canvas [flex-1]
  ├── Mode header + progress ring   ├── Toolbar
  ├── Workflow / Sources tabs       │    ├── Mode toggle [H] [V]
  ├── Step list (live)              │    ├── Zoom controls [−][%][+][Fit]
  ├── Sources (post-research)       │    ├── Theme picker
  └── Chat + input box              │    └── Export button (PPTX)
                                    │
                                    ├── Infinite canvas (pan + zoom)
                                    │   ├── Dot-grid background
                                    │   └── Slide frames (SVG rendered)
                                    │
                                    └── Thumbnail strip (horizontal)

Select mode only:
  Right panel [280px] — Properties panel (appears when element selected)
```

### Canvas Interactions

```
Hand mode (H):
  Left-click drag      →  pan canvas
  Scroll (trackpad)    →  pan (deltaX / deltaY)
  Ctrl + scroll        →  zoom centered on cursor
  Click slide          →  focus + zoom to slide
  "Fit" button         →  fit all slides in viewport

Select mode (V):
  Click element        →  select + show handles + open property panel
  Drag element         →  move (updates x/y in spec)
  Drag handle          →  resize (updates w/h in spec)
  Double-click text    →  inline edit mode
  Click canvas bg      →  deselect
  Escape               →  back to Hand mode
```

### Real-time SSE Events

```
workflow_step          { stepId, status, detail }   →  step indicator update
slide_created          { id, position }             →  blank frame on canvas
slide_written          { id, content }              →  text content appears
slide_designed         { id, spec: SlideSpec }      →  slide fully renders
element_updated        { slideId, elementId, style }→  live property update
source_found           { title, url }               →  sources tab populates
ask_user               { question, field, type }    →  chat input prompts user
workflow_complete      { deckId }                   →  export activates
```

---

## 16. Tech Stack

```
Frontend         Next.js 16, React 19, Tailwind CSS v4, TypeScript
AI Model         Claude Opus via OpenRouter (primary_model from backendConfig)
API Format       OpenAI-compatible (OpenRouter standard)
Rendering        SVG + HTML (web canvas)
Animations       GSAP (web), PptxGenJS animation XML (export)
Morph            Flubber.js (shape interpolation, web) + !! naming (PPTX)
PPTX Export      PptxGenJS
Images           Unsplash API + server-side fetch for base64 embed
Icons            Lucide React (already installed)
Streaming        SSE — same pattern as Ghostwriter
State (MVP)      Server in-memory Map<runId, DeckState>
State (Prod)     Firestore
Auth             Firebase (existing)

Reused from Ghostwriter:
  openrouter.ts        JSON call helper + retry logic
  backendConfig.ts     getOpenRouterConfig("primary") — API key + model
  agent/runs.ts        AgentRun type + emit() SSE helper
  agent/tools.ts       toOpenRouterToolSpec() converter
  routeAuth.ts         requireAuthenticatedRequest()
```

---

## 17. Build Phases

### Phase 1 — MVP (Core)

```
[ ] JSON Slide Spec schema + TypeScript types
[ ] SVG/HTML web renderer (text, shapes, images)
[ ] Thumbnail renderer (scaled mini previews)
[ ] Infinite canvas (pan + zoom) — ✅ done
[ ] Canvas mode toggle (H / V)
[ ] Element selection + handles
[ ] Property panel (text: font, size, color, bold, italic, underline, align)
[ ] Property panel (shape: fill, stroke, opacity, rotation)
[ ] Property panel (position + size for all)
[ ] Property panel (animation: type, direction, duration, delay)
[ ] SlidesOrchestrator (agent loop — adapted from Ghostwriter loop.ts)
[ ] Tools: analyze_instruction, ask_user, create_slides, write_slide, design_slide, compose
[ ] Edit tools: update_element, add_element, remove_element
[ ] SSE streaming to frontend
[ ] Basic transitions: fade, push (web + PPTX)
[ ] PptxGenJS export (shapes + text + images, no animations yet)
[ ] Font map (web Google Fonts → PPTX system fonts)
```

### Phase 2 — Power

```
[ ] search_source + analyze_source tools
[ ] fetch_image tool (Unsplash API)
[ ] Per-element GSAP animations in web renderer
[ ] Animation export in PptxGenJS (fly-in, fade, zoom)
[ ] Morph transition (Flubber.js + GSAP web, !! XML PPTX)
[ ] Advanced shapes: diamond, hexagon, arrow, speech bubble, star
[ ] reorder_slides + update_slide_background tools
[ ] "AI Assist" button in property panel
[ ] Inline text editing (double-click)
[ ] Undo / Redo (command history stack)
[ ] Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+Z etc.)
[ ] Google Font embedding in PPTX
[ ] Firestore persistence
[ ] Speaker notes view
```

### Phase 3 — Frontier

```
[ ] AI-generated images (DALL-E / Flux)
[ ] Charts (bar, pie, line) — D3 + PPTX chart XML
[ ] Video backgrounds
[ ] Complex emphasis animations (teeter, bold reveal, motion path)
[ ] Present mode (full-screen browser slideshow)
[ ] Collaborative editing (multi-user canvas)
[ ] Deck themes (AI picks from curated theme library)
[ ] Version history
[ ] Export to PDF (jsPDF — already installed)
[ ] Multi-select + group editing
```

---

## 18. Open Questions

```
Q1: Image generation model — DALL-E 3 vs Flux Schnell vs Ideogram?
    Cost / quality / speed tradeoff. Decide before Phase 3.

Q2: Unsplash API key — free tier: 50 req/hour (demo).
    Need production key for scale. Already used elsewhere in Octopilot?

Q3: Morph on web — Flubber.js (free, OSS) vs GSAP MorphSVG (paid plugin)?
    Flubber handles shape-to-shape interpolation well. Recommend Flubber.js.

Q4: PptxGenJS animation export — verify animation XML output is correct
    for Claude Opus–generated specs before shipping Phase 1.

Q5: Slide count limit per run?
    MVP: 15 slides max. Production: unlimited (streaming handles it).

Q6: Property panel — right sidebar (fixed) or floating panel (contextual)?
    Decision: right sidebar for Phase 1, floating panel Phase 2.

Q7: Undo/redo scope — per-element or full deck snapshot?
    Recommend: command pattern (each edit = reversible command object).
```

---

*Last updated: 2026-04-26*  
*Status: Architecture & Design Phase — no code written yet*
