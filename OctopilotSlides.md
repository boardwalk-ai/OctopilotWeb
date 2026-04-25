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
  archetype: DesignArchetype    // visual personality for this slide
  designIntent: string          // AI's stated goal: "make viewer feel X"
  background: Background
  elements: SlideElement[]
  transition?: TransitionSpec   // slide-level entrance transition
  speakerNotes?: string
}

type DesignArchetype =
  | "THE_HERO"
  | "THE_TENSION"
  | "THE_BREATH"
  | "THE_EDITORIAL"
  | "THE_TYPOGRAPHIC"
  | "THE_DATA_HERO"
  | "THE_LAYER"
  | "THE_GRID"

type DesignVoice =
  | "editorial"
  | "bold"
  | "cinematic"
  | "clean"
  | "organic"
  | "data"
  | "luxury"
  | "formal"    // only when explicitly requested

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

### Element ID Convention

Every element on every slide has a unique, human-readable ID.  
AI generates these when calling `design_slide`. The convention is strict so AI can always reference any element directly — no searching, no ambiguity.

**Format:** `{slideId}_{role}_{index?}`

```
Standard IDs:
  slide_001_title          Main title text
  slide_001_subtitle       Subtitle / deck label
  slide_001_body_1         First body paragraph or bullet block
  slide_001_body_2         Second body paragraph
  slide_001_caption        Caption or footnote text
  slide_001_quote          Pull quote text
  slide_001_stat_1         Hero statistic / large number
  slide_001_image_1        First image
  slide_001_image_2        Second image
  slide_001_icon_1         First icon
  slide_001_shape_bg       Background decorative shape (large, low opacity)
  slide_001_shape_accent   Accent bar / highlight shape (primary color)
  slide_001_shape_divider  Horizontal rule / divider line
  slide_001_logo           Brand logo (from Brand Kit)

Morph IDs (!! prefix — persists across slides):
  !!hero_title             Title that morphs from slide to slide
  !!story_shape            Morph Narrative Planning shape
  !!brand_logo             Logo that travels through deck
```

**Why this matters:**

```
User says: "Slide 3 ရဲ့ body text ကို font size 18 ပြောင်းပေး"
AI knows:   elementId = "slide_003_body_1"   ← no search needed

User clicks on the accent bar on slide 5
Frontend:   selectedElementId = "slide_005_shape_accent"
            → Property Panel shows fill color, stroke, opacity

AI calls:   update_element({
              slideId: "slide_005",
              elementId: "slide_005_shape_accent",
              changes: { fill: "#f43f5e" }
            })
```

**Rules AI must follow:**
- Every element on every slide gets an ID at `design_slide` time — no unnamed elements
- IDs are unique within the deck (not just within a slide)
- `!!` prefix reserved for Morph elements only
- AI uses the exact same ID when calling `update_element` — never re-generates or guesses

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

## 9. Color Theme System

Every deck gets a **DeckTheme** — a named palette with semantic color roles.  
The AI knows each theme by name, understands its mood, and applies it consistently across all slides.  
Users can also change the theme after generation.

### Why Semantic Roles (Not Raw Hex)

The AI doesn't say "use #f43f5e on the title". It says "use `theme.primary` on the accent bar".  
This means:
- Swap the theme → entire deck recolors instantly
- PPTX export respects the same values (same hex → same color in PowerPoint)
- AI and user edits both reference the same token names

### DeckTheme Type

```typescript
type DeckTheme = {
  name: string              // "rose + cream + black"
  palette: {
    background: string      // main slide background
    surface: string         // card / panel / callout background
    primary: string         // main accent — shapes, highlights, CTAs
    secondary: string       // supporting accent — secondary elements
    text: string            // primary text color
    textMuted: string       // secondary / caption text
    border: string          // subtle dividers and borders
  }
  typography: {
    heading: FontChoice     // used for titles + subtitles
    body: FontChoice        // used for body + captions
  }
}

type FontChoice = {
  web: string               // Google Font name (web renderer)
  pptx: string              // System font fallback (PPTX export)
  weight: number            // default weight for this role
}
```

The `DeckTheme` is stored at the deck level and passed to every `design_slide` call.

### Built-in Theme Library

```
Theme Name                 Background    Primary      Secondary    Feel
─────────────────────────────────────────────────────────────────────────────────
rose + cream + black       #0a0a0a       #f43f5e      #fef3c7      Romantic, bold
matcha + cream + black     #0a0a0a       #6b8f5e      #fef3c7      Calm, natural
ocean + white + navy       #0f2744       #0ea5e9      #ffffff      Corporate, clean
ember + charcoal + black   #0f0f0f       #f97316      #d4d4d4      Energetic, dark
forest + ivory + dark      #111a14       #4a7c59      #f5f0e8      Grounded, premium
slate + gold + midnight    #0f172a       #f59e0b      #94a3b8      Luxury, bold
lavender + white + violet  #1e1b4b       #a78bfa      #ffffff      Creative, dreamy
arctic + silver + midnight #0a0f1e       #38bdf8      #e2e8f0      Tech, minimal
crimson + bone + black     #0c0a09       #dc2626      #fafaf9      Dramatic, serious
sage + linen + walnut      #2d2a24       #84a98c      #f8f4ee      Refined, organic
```

### ask_user — Theme Selection

At the start of every deck generation, the AI asks the user for their preferred theme using `ask_user` with `inputType: "choice"`:

```typescript
ask_user({
  question: "What color theme should this deck use?",
  field: "deckTheme",
  inputType: "choice",
  suggestions: [
    "rose + cream + black",
    "matcha + cream + black",
    "ocean + white + navy",
    "ember + charcoal + black",
    "forest + ivory + dark",
    "slate + gold + midnight",
    "custom — I'll describe it"
  ]
})
```

If the user picks **"custom — I'll describe it"**, the AI asks a follow-up:

```typescript
ask_user({
  question: "Describe your preferred colors. Example: 'dark navy background, gold accents, white text' or 'light beige, terracotta, deep brown'",
  field: "customThemeDescription",
  inputType: "text"
})
```

The AI then synthesizes a `DeckTheme` from the description — mapping the described colors to the semantic palette roles.

### How design_slide Uses the Theme

The `design_slide` tool receives the full `DeckTheme` in every call.  
The AI applies semantic roles, never hardcoded colors:

```
background.type: "solid", color: theme.palette.background
accent bar shape: fill = theme.palette.primary
title text: color = theme.palette.text
caption text: color = theme.palette.textMuted
callout card: fill = theme.palette.surface, stroke = theme.palette.border
highlight shape: fill = theme.palette.secondary
```

### Theme Switching (Post-Generation)

A new tool `update_deck_theme` allows changing the theme after generation:

```typescript
update_deck_theme({
  deckId: "deck_abc",
  theme: "lavender + white + violet"
})
```

This triggers a re-render of all slides with the new palette.  
No content changes — only colors and backgrounds update.  
Frontend: theme picker in the toolbar. AI: can also suggest a theme change ("This data-heavy deck might read better in arctic + silver").

### AI Color Rules (System Prompt)

The AI internalizesthese rules when applying colors from the theme:

```
• Never use more than 3 colors on one slide (bg + text + primary accent)
• primary  → use sparingly: one key shape or bar per slide
• secondary → supporting elements (icon bg, light callouts)
• surface  → inset sections, code blocks, callout boxes
• textMuted → captions, footnotes, metadata — never body text
• Dark bg: text must be theme.text (near-white) — never dark on dark
• Light bg: text must be near-black — never light on light
• Shapes as emphasis, not decoration — if a shape doesn't serve content, remove it
• Consistency > creativity — same element type = same color across slides
```

### Color in PPTX Export

No special handling needed — the DeckTheme hex values ARE the exported values.  
`theme.palette.primary = "#f43f5e"` → that exact hex is written to DrawingML.  
Theme switching before export = different colors in the .pptx. ✅

---

## 10. Agentic Workflow

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

## 11. Complete Tool List (16 tools)

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
| `update_deck_theme` | `{ deckId, theme: string \| DeckTheme }` | rerendered deck | Swap full color palette on all slides |

---

## 12. Workflow Sequence

```
User types: "Climate change impacts on SE Asia, board presentation, professional"

Step 1 — analyze_instruction
  → { topic, audience:"board", tone:"professional", complexity:"medium" }

Step 2 — ask_user (theme)
  → "What color theme should this deck use?"
  → suggestions: [rose + cream + black, ocean + white + navy, slate + gold + midnight …]
  User: "ocean + white + navy"

Step 3 — ask_user (slide count)
  → "How many slides would you like? (Recommended: 8–10 for a board deck)"
  User: "9"

Step 4 — create_slides (count: 9)
  → slide_001 … slide_009 (blank, IDs assigned)
  → Frontend: 9 blank frames appear on canvas immediately

Step 5 — search_source (2–3 queries)
  → web results

Step 6 — analyze_source (per result)
  → structured facts, data, quotes

Step 7 — write_slide (per slide, sequential)
  → slide_001: { title, bullets, speakerNotes }
  → Frontend: slide text appears live

Step 8 — fetch_image + design_slide (per slide, with DeckTheme: "ocean + white + navy")
  → slide_001: full SlideSpec (layout, bg, elements, animations, !! IDs, theme-colored)
  → Frontend: slide fully renders on canvas

Step 9 — compose
  → final deck snapshot
  → Frontend: Export button activates, theme picker + "AI Assist" available on all elements
```

---

## 13. Creative Engine & Design Intelligence

> **The goal:** Not a template filler. Not a boring corporate slide machine.  
> A presentation that makes the audience lean forward.  
> Personality-driven. Visually flashy. Carefully crafted.  
> Formal only when the user explicitly asks for it.

---

### The Manifesto

Most AI presentation tools are scared. They center everything. They use the same layout for every slide. They animate with a gentle fade and call it done.

OctopilotSlides is not scared.

The AI designer has opinions. It makes bold choices. It breaks expected patterns — intentionally. It knows the difference between "flashy and cheap" and "flashy and stunning." It understands that a single 120pt number on a dark slide with perfect typography is more powerful than eight bullets in a box.

**Flashy does not mean busy. Flashy means intentional drama.**

---

### The AI Designer Persona

This is the identity the system prompt establishes. Not a list of rules — a character.

```
You are a senior visual designer and creative director with 12 years of 
experience. You've designed decks for Apple product launches, McKinsey 
strategy presentations, and Series B pitch days at Y Combinator.

Your work has been featured in design publications. People ask you to 
redesign slides they thought were "fine" — and after you touch them, 
they can't believe the difference.

Your philosophy:
  Restraint is power. Every element earns its place or gets cut.
  Bold choices beat safe choices — always.
  A slide should make the viewer FEEL something before they read anything.
  Templates are starting points for people who lack ideas. You don't use them.

Your process for every slide:
  1. Ask: what is the ONE thing this slide must communicate?
  2. Ask: what should the viewer feel? (convinced / surprised / inspired / challenged)
  3. Ask: what archetype fits this moment in the story?
  4. Design from the focal point outward. Not from the top down.
  5. After designing — remove one thing. Then check if it still works.
     If yes, it's better. If no, put it back.

Your constraint: the design must export perfectly to .pptx.
Your ambition: every slide should look like it was made by a human who cares.
```

---

### Design Voice System

At deck start, AI picks a **Design Voice** based on topic + audience + theme.  
This voice sets the personality for the whole deck — not per slide, but as a through-line.

```typescript
type DesignVoice =
  | "editorial"     // magazine-style, unexpected image placement, type-forward
  | "bold"          // high contrast, huge type, minimal elements — tech/startup feel
  | "cinematic"     // dark backgrounds, dramatic lighting shapes, film-like
  | "clean"         // Swiss design influence, grid-based, confident whitespace
  | "organic"       // warm tones, soft shapes, human feel — suited to brand/culture decks
  | "data"          // numbers as heroes, systematic grids, chart-first
  | "luxury"        // extreme whitespace, thin typography, single accent per slide
  | "formal"        // only when explicitly requested — classic hierarchy, conservative
```

AI declares the voice before designing any slide:

```typescript
design_slide({
  id: "slide_001",
  designVoice: "cinematic",    // ← chosen for this deck, applied to all slides
  archetype: "THE_HERO",       // ← chosen for this specific slide
  designIntent: "Open with drama. The viewer should feel the scale of the problem.",
  ...
})
```

---

### The 8 Design Archetypes

Each slide gets one archetype. AI picks based on content + where the slide sits in the narrative. The same archetype cannot be used twice in a row.

```
THE HERO
  Focal point: one dominant element, 50–70% of slide area
  Everything else is secondary — much smaller, lower opacity
  Whitespace: aggressive — 50%+ of slide is empty
  Use: opening slide, key stat, pivotal revelation
  Example: "73%" at 140pt, left-aligned, bottom third. Nothing else but a
           thin accent line above and a 12pt caption below.

THE TENSION  
  Focal point: two elements in visual opposition — scale, color, or position
  Left vs right. Big vs small. Dark vs light.
  Creates energy through visual conflict
  Use: problem vs solution, before vs after, old vs new
  Example: left half — dark, single word "BEFORE" in red. Right half — bright,
           "AFTER" in white. Hard vertical split between them.

THE BREATH
  Max 2 elements. Rest is space.
  The space IS the message — it signals weight and importance
  Use: section breaks, transitions, moments that need to land
  Example: one sentence, 32pt, dead center. Nothing else. No background shapes.
           No decorations. The silence is the design.

THE EDITORIAL
  Magazine/newspaper layout — unexpected element placement
  Image bleeds off one or two edges. Text overlaps image.
  Nothing is perfectly centered or perfectly aligned to grid
  Use: story slides, body content, human interest moments
  Example: image fills right 55% and bleeds top/right/bottom. Title at 
           bottom-left of image (white text, semi-transparent bg pill). 
           3 bullets left column. Feels like a Wired magazine spread.

THE TYPOGRAPHIC
  Type IS the design. No images, minimal shapes.
  Weight contrast: one word at 900 weight, rest at 300
  Color contrast: one key word in accent color, rest white
  Size contrast: one phrase at 96pt, attribution at 14pt
  Use: quotes, bold statements, section titles, manifestos
  Example: "Everything is a remix." at 80pt, white, left-aligned.
           "— Kirby Ferguson, 2012" at 14pt, 40% opacity, below.
           Thin vertical red bar left edge. Nothing else.

THE DATA HERO
  One number owns the slide — 100pt+, bold, accent colored or white
  Supporting text is 8–10x smaller than the hero number
  Background can have a subtle atmosphere shape (low opacity circle)
  Use: impact stats, financial results, growth metrics, survey results
  Example: "4.2×" at 120pt, white, centered. "faster than the industry average"
           at 18pt, 50% opacity, below. That's the whole slide.

THE LAYER
  3 depth layers create a sense of space and premium quality:
    Layer 1 (back):    Large shape, 8–15% opacity — creates atmosphere
    Layer 2 (middle):  Image or colored block — anchored to edge
    Layer 3 (front):   Text content — highest contrast, most legible
  Use: any slide that needs to feel expensive and considered
  Example: Layer 1: huge circle, 10% white, bottom-right corner (bleeds).
           Layer 2: image, right 45%, bleeds right edge.
           Layer 3: title + 2 bullets, left 48%, full opacity white.

THE GRID
  Systematic equal units — 2, 3, or 4 cells
  Visual balance: same weight per cell, consistent padding
  Each cell: icon + label + short stat or descriptor
  Use: feature comparisons, team slides, process steps, numbered lists
  Example: 3 columns. Each: accent-colored number at top (01, 02, 03),
           icon below, 16pt descriptor. Same height. Clean dividers.
```

---

### Flashy Techniques Toolkit

These are the specific moves that separate "looks AI-generated" from "looks designed."

```
SCALE DRAMA
  Put two elements on the same slide at radically different sizes.
  "4.2×"  →  120pt, white
  "return on investment"  →  14pt, 50% opacity
  The contrast does all the work. No color needed.

THE BLEED
  Extend shapes and images off the edge of the slide.
  An image that fills x:52, y:0, w:60, h:100 bleeds right, top, bottom.
  It anchors the slide. Makes it feel less like a PowerPoint, more like design.
  Rule: at least 1 element per deck should bleed.

COLOR ECONOMY — one shot, maximum impact
  Primary accent color appears ONCE per slide — on the ONE most important element.
  If the accent appears on 5 things, it appears on nothing.
  Spend it like a limited resource.

THE ATMOSPHERE SHAPE
  Large shape (circle or blob), 8–15% opacity, offset to a corner or edge.
  Not decoration — depth. Creates the illusion of a second light source.
  The viewer doesn't consciously see it, but the slide feels more expensive.
  Rule: never center the atmosphere shape. Always push it to a corner or bleed it.

WEIGHT CONTRAST IN TEXT
  "The market is" → 400 weight
  "broken."        → 800 weight, same size, same color
  Emphasis without extra color or scale change. Feels like editorial writing.

ASYMMETRIC ANCHORING
  Don't center the headline. Put it bottom-left while space floats above.
  Or top-right while an image dominates bottom-left.
  Asymmetry = dynamic. Symmetry = static (use it intentionally for THE BREATH).

THE ACCENT BAR
  A 4–6px vertical rectangle in the primary accent color.
  Left of a quote — it's a citation marker.
  Left of a title section — it's a brand signal.
  Horizontal at top or bottom — it's a rule line.
  Simple. Permanent. Premium.

OVERSIZED BACKGROUND TYPE
  A single word at 200–300pt, 4–6% opacity, as a background texture.
  Behind all other elements. The word relates to the slide's concept.
  "GROWTH" huge and ghost-like behind a revenue chart.
  Viewers don't read it consciously — they feel the theme.

CINEMATIC GRADIENT OVERLAY
  On image slides: add a gradient overlay from transparent to 80% dark.
  Direction matches text placement — text on left → gradient dark on left.
  Makes any image work as a slide background. Text always legible.
```

---

### Animation Philosophy — Cinematic, Not Corporate

```
PRINCIPLE: Animation should serve the story, not decorate the slide.

Every animation answers one of two purposes:
  1. REVEAL — builds information in sequence (viewer processes one thing at a time)
  2. EMPHASIS — draws the eye to what matters most

Corporate animation (avoid):
  ❌ Everything fades in at once
  ❌ Random fly-ins from all directions
  ❌ Spinning, bouncing logo
  ❌ Animation on every single element

Cinematic animation (do this):
  ✅ Title appears first — establishes context
  ✅ Image or hero visual — arrives second, audience orients
  ✅ Key stat or focal point — arrives third, with EMPHASIS (pulse or zoom)
  ✅ Supporting details — last, quieter entrance
  ✅ One element per slide gets emphasis treatment — the rest just appear

Timing rules:
  First element:   0ms delay
  Each subsequent: +150–200ms stagger
  Total entrance:  should complete within 1.2 seconds
  Emphasis:        only on the slide's hero element, after all entrances done

Direction rule:
  All elements on one slide move in the same direction — consistency = professionalism
  Exception: THE TENSION archetype — left element from left, right from right
```

---

### Slide Personality Sequencing

A deck has rhythm. Highs and lows. Drama and breath. The AI plans this.

```
Rule: Same archetype cannot repeat on consecutive slides.
Rule: Every 3–4 slides, include one THE BREATH or THE TYPOGRAPHIC slide.
Rule: THE HERO opens and closes the deck.
Rule: Data-heavy slides (THE GRID, THE DATA HERO) are always followed by 
      something visually lighter.

Example rhythm for a 9-slide deck:
  1. THE HERO      — opening impact
  2. THE TENSION   — the problem / two worlds
  3. THE DATA HERO — the scale ("73% of companies fail at this")
  4. THE EDITORIAL — human story / context
  5. THE BREATH    — pause before the turn
  6. THE LAYER     — the solution, premium feel
  7. THE GRID      — how it works / features
  8. THE TYPOGRAPHIC — the belief statement / quote
  9. THE HERO      — close with impact, CTA
```

---

### Formal Mode — The Exception

When user explicitly says: "board presentation," "conservative audience," "corporate," "formal" — the AI switches to `DesignVoice: "formal"`.

```
Formal mode rules:
  - Centered layouts allowed
  - Subdued animations (fade only, 300ms)
  - Conservative color usage (accent only on CTAs)
  - Standard hierarchy (title top, content below)
  - Archetype pool reduced to: THE GRID, THE DATA HERO, THE BREATH
  - Still: no bullet walls, no template feel — just less dramatic
```

Everything else defaults to bold, flashy, personality-driven design.

---

### Design Self-Critique (Before Returning)

After generating every slide, the AI must run this internal check:

```
1. Can I identify the focal point instantly?           → if no, redesign
2. Is there one unexpected visual choice?              → if no, add one
3. Did I use the accent color more than once?          → if yes, remove uses
4. Are there more than 3 font sizes?                   → if yes, consolidate
5. Does this look like it came from a template?        → if yes, break something
6. Is the archetype different from the previous slide? → if no, change it
7. Does the animation sequence have a clear order?     → if no, fix timing
8. Would I be proud to show this to a designer?        → if no, push further
```

---

### Layout Selection (Updated)

```
Title slide       →  THE HERO, design voice sets the tone for the whole deck
Comparison        →  THE TENSION — two sides, high contrast
Process / Steps   →  THE GRID — numbered, equal weight
Key statistic     →  THE DATA HERO — number owns the slide
Quote / Belief    →  THE TYPOGRAPHIC — type as design
Section break     →  THE BREATH — almost empty, maximum weight
Body content      →  THE EDITORIAL — image bleeds, text overlaps
Story / Human     →  THE EDITORIAL or THE LAYER
Premium / Feature →  THE LAYER — depth, expensive feel
Closing / CTA     →  THE HERO — bold close, one message

```

### Visual Hierarchy (Updated)

```
Hero stat / number:  100–140pt, fontWeight 800, accent or white
Slide title:         48–72pt, fontWeight 700–800
Subtitle:            24–32pt, fontWeight 400, opacity 60%
Body text:           16–20pt, fontWeight 400, opacity 60%
Caption / footnote:  12–14pt, fontWeight 400, opacity 35%
Ghost BG text:       200–300pt, fontWeight 900, opacity 4–6%
```

### Morph Continuity

```
• Assign "!!" IDs to hero elements that travel across slides
• Title on slide 1 → "!!main_title" — same ID on slide 2 triggers Morph
• Use Morph to create narrative continuity (element "travels" through deck)
• plan_morph_story tool designs the journey upfront (see Feature 3)
```

---

## 14. .pptx Export

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

## 15. State Management

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

## 16. Frontend — OctopilotSlidesView

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

## 17. Tech Stack

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

## 18. Build Phases

### Phase 1 — MVP (Core) — **complete (18 / 18)**

```
[x] JSON Slide Spec schema + TypeScript types
[x] SVG/HTML web renderer (text, shapes, images)
[x] Thumbnail renderer (scaled mini previews)
[x] Infinite canvas (pan + zoom)
[x] Canvas mode toggle (H / V)
[x] Element selection + handles
[x] Property panel (text: font, size, color, bold, italic, underline, align)
[x] Property panel (shape: fill, stroke, opacity, rotation)
[x] Property panel (position + size for all)
[x] Property panel (animation: type, direction, duration, delay)
[x] SlidesOrchestrator (agent loop — adapted from Ghostwriter loop.ts)
[x] DeckTheme type + built-in theme library (10 named palettes)
[x] ask_user for theme selection (choice input type)
[x] Tools: analyze_instruction, ask_user, create_slides, write_slide, design_slide, compose, update_deck_theme
[x] Edit tools: update_element, add_element, remove_element
[x] SSE streaming to frontend
[x] Basic transitions: fade, push (web + PPTX)
[x] PptxGenJS export (shapes + text + images + FONT_MAP web→PPTX fonts; per-element PPTX animations deferred)
```

### Phase 2 — Power

```
[ ] search_source + analyze_source tools
[ ] fetch_image tool (Unsplash API)
[ ] Per-element GSAP animations in web renderer
[ ] Animation export in PptxGenJS (fly-in, fade, zoom)
[ ] Smart animation choreography (narrative-aware timing in system prompt)
[ ] Morph transition (Flubber.js + GSAP web, !! XML PPTX)
[ ] Morph Narrative Planning — plan_morph_story tool (Feature 3)
[ ] Advanced shapes: diamond, hexagon, arrow, speech bubble, star
[ ] reorder_slides + update_slide_background tools
[ ] "AI Assist" button in property panel
[ ] Inline text editing (double-click)
[ ] Undo / Redo (command history stack)
[ ] Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+Z etc.)
[ ] Google Font embedding in PPTX
[ ] Firestore persistence
[ ] Speaker notes view
[ ] Brand Kit — BrandKit schema + update_brand_kit tool (Feature 1)
[ ] Slides from Anything — ingest_source tool (URL/PDF/DOCX) (Feature 2)
[ ] AI Deck Review — review_deck tool + feedback panel (Feature 4)
[ ] Audience Mode — AudienceMode type + deck versioning (Feature 5)
[ ] Presenter Mode — /present/[deckId] route + keyboard nav (Feature 6)
```

### Phase 3 — Frontier

```
[ ] AI-generated images (DALL-E / Flux)
[ ] Charts (bar, pie, line) — D3 + PPTX chart XML
[ ] Video backgrounds
[ ] Complex emphasis animations (teeter, bold reveal, motion path)
[ ] Collaborative editing (multi-user canvas)
[ ] Version history + deck snapshots
[ ] Export to PDF (jsPDF — already installed)
[ ] Multi-select + group editing
[ ] Google Slides export (content only, no animations)
```

---

## 19. Feature Roadmap — Confirmed Features

Six features confirmed for the product roadmap.

---

### Feature 1: Brand Kit

Every company has brand guidelines. OctopilotSlides is the only AI deck tool that respects them.

**What it does:**
Users upload their brand once. Every deck AI generates stays on-brand — automatically.

**Brand Kit Schema:**

```typescript
type BrandKit = {
  companyName: string
  logoUrl?: string               // PNG/SVG — embedded on title + closing slides
  palette: {
    primary: string              // brand primary color (hex)
    secondary: string            // brand secondary color
    background: string           // preferred slide bg
    text: string                 // preferred text color
  }
  typography: {
    heading: string              // e.g. "Montserrat"
    body: string                 // e.g. "Inter"
  }
  tone?: "formal" | "modern" | "playful" | "minimal"
  tagline?: string               // optionally placed on title slide
}
```

**How it integrates:**
- Stored in user profile (Firestore)
- At deck start: `ask_user` offers "Use Brand Kit" as first theme option
- If selected: `DeckTheme` is synthesized from `BrandKit.palette` + `BrandKit.typography`
- Logo placed automatically on slide 1 and slide N (closing)
- `companyName` inserted into title slide subtitle

**Tool:** `update_brand_kit` — user can update via settings, AI can read but not overwrite

**Why it matters:** Gamma, Beautiful.ai, Tome — none do this. It's the #1 request from B2B users.

---

### Feature 2: Slides from Anything

Paste a URL. Upload a PDF. Drop a Word doc. Get a deck.

**Supported inputs:**

```
URL:   Blog post / article / research paper / product page / Wikipedia
PDF:   Company report / whitepaper / academic paper
DOCX:  Word document / existing outline
Text:  Raw pasted text (already supported via main input)
```

**How it works:**

```
User pastes URL or uploads file
        ↓
New tool: ingest_source({ type: "url"|"pdf"|"docx", content })
        ↓
Extracts: title, key sections, facts, data, quotes
        ↓
Returns: { outline, keyPoints[], rawText }
        ↓
analyze_instruction uses this as the brief
        ↓
Normal generation flow continues
```

**New tool: `ingest_source`**

```typescript
ingest_source({
  type: "url" | "pdf" | "docx",
  url?: string,           // for URL type
  fileBase64?: string,    // for PDF/DOCX
  fileName?: string
})
// returns: { title, outline, keyPoints[], quotes[], data[], rawText }
```

**Implementation:**
- URL: Cheerio / Readability to extract clean article text (server-side)
- PDF: `pdf-parse` npm package
- DOCX: `mammoth` npm package (already battle-tested)

**Frontend:** drag-and-drop zone or URL input box in sidebar — above the chat input

---

### Feature 3: Morph Narrative Planning

The most unique feature in the market. No other AI deck tool does this.

**The concept:**
AI plans a *visual story* upfront — a key shape morphs and transforms across the deck, acting as a visual metaphor that travels with the narrative.

**How the AI plans it:**

Before running `design_slide` on individual slides, AI runs `plan_morph_story`:

```typescript
plan_morph_story({
  deckId: string,
  narrative: string,          // "problem → scale → solution → outcome"
  morphElement: {
    id: "!!story_shape",      // persists across all slides
    concept: string,          // "a circle representing the problem"
    journey: [
      { slideId: "slide_001", shape: "circle",    meaning: "the problem exists",   style: { fill: "#ef4444", size: 15 } },
      { slideId: "slide_003", shape: "oval",      meaning: "problem is growing",   style: { fill: "#dc2626", size: 25 } },
      { slideId: "slide_005", shape: "rectangle", meaning: "problem is contained", style: { fill: "#f59e0b", size: 20 } },
      { slideId: "slide_007", shape: "circle",    meaning: "problem is solved",    style: { fill: "#22c55e", size: 18 } },
      { slideId: "slide_009", shape: "star",      meaning: "outcome achieved",     style: { fill: "#f59e0b", size: 22 } },
    ]
  }
})
```

`design_slide` then includes `!!story_shape` in the specified slides with the planned style.

**Web:** Flubber.js interpolates shape paths — circle smoothly morphs to rectangle to star
**PPTX:** Same `!!` element IDs → PowerPoint Morph transition XML — 100% fidelity

**System prompt rule:** AI must plan morph story ONLY when narrative arc is clear (problem/solution, before/after, journey). Not forced on every deck.

---

### Feature 4: AI Deck Review

After generation (or at any time), user clicks **"Review Deck"** — AI audits the full deck and gives structured feedback.

**Output format:**

```
📊 Deck Score: 78 / 100

🔴 Issues (fix these):
  Slide 2:  7 bullets — too dense. Max 4. Split into 2 slides.
  Slide 5:  No visual. Pure text. Add a shape, chart, or image.
  Missing:  No closing/CTA slide. Add one.

🟡 Suggestions (consider these):
  Slide 4:  Headline is weak — "Results" → try "Revenue up 3× in 6 months"
  Slide 6:  Stat is buried in body text — make it the hero (large number, center slide)
  Slide 8:  Animation is heavy — 6 animated elements on one slide feels chaotic

✅ What's working:
  Visual hierarchy is consistent across all slides.
  Good use of white space on slides 1, 3, 7.
  Morph continuity is clean.

Estimated presentation time: ~12 minutes at 1.5 min/slide
```

**How it works:**
- Separate LLM call (not part of agent loop)
- Input: full `DeckState` serialized as JSON + `SlideSpec[]`
- System prompt: deck review criteria (visual hierarchy, content density, narrative flow, CTA presence)
- Output: structured `DeckReview` JSON → rendered as feedback panel in sidebar

**New tool** (or direct API call): `review_deck`

**Cost:** ~1 LLM call, cheap. Can offer as free feature.

---

### Feature 5: Audience Mode

Same content. Different deck for different audiences. One click.

**Audience profiles:**

```typescript
type AudienceMode =
  | "board"         // formal, data-first, conservative design, dense info ok
  | "investor"      // punchy, hero numbers, bold visuals, 10-slide max, narrative-driven
  | "conference"    // visual-heavy, minimal text, big images, presentation-optimized
  | "internal"      // casual, info-dense, less design polish needed
  | "client"        // professional, outcome-focused, solution-framing
  | "custom"        // user describes their audience
```

**How it works:**

```
User has completed "board" deck
        ↓
Clicks "Audience Mode" → selects "investor"
        ↓
AI re-runs design_slide (per slide) with:
  - same write_slide content (text unchanged)
  - new audienceMode: "investor" context
  - instruction: "reframe for investors — focus on traction, market size, ROI"
        ↓
New deck version created (original preserved)
        ↓
User can toggle between versions in UI
```

**DeckState versioning:** `DeckState.versions: Record<AudienceMode, SlideSpec[]>`

**Frontend:** "Audience" button in toolbar → dropdown → generates new version → tab-switch between versions

---

### Feature 6: Presenter Mode

Present directly from the browser. No export needed.

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  Current Slide (full-screen)                                 │
│                                                              │
│  [animated, GSAP plays on click/keyboard]                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Presenter view (separate window / second screen):
┌──────────────────────┬──────────────────────────────────────┐
│  Current slide mini  │  Speaker Notes                        │
│  Next slide mini     │                                       │
│                      │  ⏱ 4:32  [Slide 3 / 9]               │
└──────────────────────┴──────────────────────────────────────┘
```

**Controls:**

```
→ / Space       Next slide / next animation step
←              Previous slide
F / Escape     Enter / exit fullscreen
L              Laser pointer mode (red dot follows cursor)
B              Blank screen (black — audience attention)
```

**Animations:** GSAP timelines trigger on click — same animation system used in canvas preview, no new code needed

**Speaker notes:** Already in `SlideSpec.speakerNotes` — just display them

**Timer:** Simple `setInterval` counting up from 00:00

**Implementation:** New route `/present/[deckId]` — reads from DeckState, renders full-screen SlideCanvas with keyboard event listeners

---

### Competitive Position After These 6 Features

```
Feature                    Gamma   Beautiful.ai   Tome   OctopilotSlides
───────────────────────────────────────────────────────────────────────────
Brand Kit                    ❌         ❌          ❌         ✅
Slides from URL/PDF          partial    ❌          ❌         ✅
Morph Narrative (AI-planned) ❌         ❌          ❌         ✅  ← unique
AI Deck Review               ❌         ❌          ❌         ✅
Audience Mode                ❌         ❌          ❌         ✅
Presenter Mode               ✅         ❌          ❌         ✅
```

---

## 20. Open Questions

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
*Sections: 20 — Creative Engine fully specified (Section 13): Manifesto, Designer Persona, Design Voice System, 8 Archetypes, Flashy Techniques Toolkit, Cinematic Animation Philosophy, Slide Personality Sequencing, Formal Mode, Self-Critique loop*
