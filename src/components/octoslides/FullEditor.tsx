"use client";

import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import { STAGE_H, STAGE_W } from "./SlideCanvas";

export type EditorAnimation = { effect: string; trigger?: string; durationMs?: number; delayMs?: number };
export type EditorElement = { id: string; name: string; kind: string; text?: string; x: number; y: number; w: number; h: number; rot?: number; animations?: EditorAnimation[]; format?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: string; color?: string; size?: number; font?: string } };
export type EditorLayout = { slides: Array<{ slide: number; elements: EditorElement[]; transition?: string }> };

type Props = {
  version: number;
  images: Record<number, string>;
  slides: number[];
  layout: EditorLayout | null;
  active: number;
  setActive: (slide: number) => void;
  selected: EditorElement | null;
  onSelect: (element: EditorElement | null) => void;
  onEdit: (name: string, payload: Record<string, unknown>) => Promise<void>;
  onAdd: (kind: "text" | "shape") => Promise<void>;
  onTransition: (transition: string) => Promise<void>;
  onAsk: (text: string, target?: { slide: number; name: string }) => Promise<void>;
  question: string | null;
  onAnswer: (text: string) => Promise<void>;
  onClose: () => void;
  onDownload: () => void;
  onPresent: () => void;
  busy: boolean;
  saving: boolean;
  notice: string | null;
};

const TABS = ["Home", "Insert", "Animations", "Transitions", "Arrange"] as const;
const ENTRANCES = ["none", "appear", "fade", "rise", "fly", "wipe", "zoom"];
const EXITS = ["none", "disappear", "fadeOut", "flyOut", "wipeOut", "zoomOut"];
const TRANSITIONS = ["fade", "push", "wipe", "dissolve", "zoom", "morph", "none"];

function RibbonButton({ children, onClick, disabled = false, active = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`state rounded-[var(--md-shape-s)] px-3 py-2 text-sm transition-colors ${active ? "bg-[var(--md-secondary-container)] text-[var(--md-on-secondary-container)]" : "hover:bg-[var(--md-surface-container-high)]"}`}>{children}</button>;
}

function Field({ label, value, onChange, min = 0, max = 100, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="flex flex-col gap-1 text-[11px] text-[var(--md-on-surface-variant)]">{label}
    <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-20 rounded-[var(--md-shape-xs)] border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-2 py-1.5 text-sm text-[var(--md-on-surface)]" />
  </label>;
}

function Select({ label, value, choices, onChange }: { label: string; value: string; choices: string[]; onChange: (value: string) => void }) {
  return <label className="flex flex-col gap-1 text-[11px] text-[var(--md-on-surface-variant)]">{label}
    <select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-28 rounded-[var(--md-shape-xs)] border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-2 py-1.5 text-sm text-[var(--md-on-surface)]">
      {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
    </select>
  </label>;
}

function SelectionRibbon({ tab, element, onEdit, busy }: { tab: typeof TABS[number]; element: EditorElement | null; onEdit: Props["onEdit"]; busy: boolean }) {
  const [format, setFormat] = useState(element?.format ?? {});
  const [text, setText] = useState(element?.text ?? "");
  const [box, setBox] = useState({ x: element?.x ?? 0, y: element?.y ?? 0, w: element?.w ?? 0, h: element?.h ?? 0, rot: element?.rot ?? 0 });
  const [fill, setFill] = useState("#4472c4");
  const existing = element?.animations ?? [];
  const [entrance, setEntrance] = useState(existing.find((a) => ENTRANCES.includes(a.effect))?.effect ?? "none");
  const [exit, setExit] = useState(existing.find((a) => EXITS.includes(a.effect))?.effect ?? "none");
  const [trigger, setTrigger] = useState("onClick");
  const [duration, setDuration] = useState(650);
  const [delay, setDelay] = useState(0);
  const saveFormat = (next: typeof format) => { setFormat(next); if (element) void onEdit(element.name, { format: next }); };
  if (!element) return <p className="self-center px-3 text-sm text-[var(--md-on-surface-variant)]">Select an element on the slide to edit its content, style, position, and motion.</p>;
  if (tab === "Home") return <div className="flex min-w-0 items-end gap-2 overflow-x-auto pb-1">
    {element.kind === "text" && <>
      <Select label="Font" value={format.font ?? "Aptos"} choices={["Aptos", "Arial", "Calibri", "Georgia", "Times New Roman", "Montserrat"]} onChange={(font) => saveFormat({ ...format, font })} />
      <Field label="Size" value={format.size ?? 24} min={6} max={200} onChange={(size) => saveFormat({ ...format, size })} />
      <RibbonButton active={!!format.bold} onClick={() => saveFormat({ ...format, bold: !format.bold })}><strong>B</strong></RibbonButton>
      <RibbonButton active={!!format.italic} onClick={() => saveFormat({ ...format, italic: !format.italic })}><em>I</em></RibbonButton>
      <RibbonButton active={!!format.underline} onClick={() => saveFormat({ ...format, underline: !format.underline })}><u>U</u></RibbonButton>
      <Select label="Align" value={format.align ?? "left"} choices={["left", "center", "right", "justify"]} onChange={(align) => saveFormat({ ...format, align })} />
      <label className="flex flex-col gap-1 text-[11px] text-[var(--md-on-surface-variant)]">Text color<input aria-label="Text color" type="color" value={`#${format.color ?? "202020"}`} onChange={(event) => saveFormat({ ...format, color: event.target.value.slice(1).toUpperCase() })} /></label>
      <label className="flex min-w-[220px] flex-col gap-1 text-[11px] text-[var(--md-on-surface-variant)]">Content<input aria-label="Text content" value={text} onChange={(event) => setText(event.target.value)} className="rounded border border-[var(--md-outline-variant)] bg-[var(--md-surface)] px-2 py-1.5 text-sm" /></label>
      <RibbonButton disabled={busy || text === element.text} onClick={() => void onEdit(element.name, { text })}>Save text</RibbonButton>
    </>}
    {element.kind !== "text" && <span className="self-center text-sm text-[var(--md-on-surface-variant)]">{element.kind} selected · use Arrange or Animations to edit it.</span>}
  </div>;
  if (tab === "Animations") return <div className="flex items-end gap-3 overflow-x-auto pb-1">
    <Select label="In animation" value={entrance} choices={ENTRANCES} onChange={setEntrance} />
    <Select label="Out animation" value={exit} choices={EXITS} onChange={setExit} />
    <Select label="Start" value={trigger} choices={["onClick", "withPrevious", "afterPrevious"]} onChange={setTrigger} />
    <Field label="Duration ms" value={duration} min={100} max={10000} step={50} onChange={setDuration} />
    <Field label="Delay ms" value={delay} min={0} max={10000} step={50} onChange={setDelay} />
    <RibbonButton disabled={busy} onClick={() => void onEdit(element.name, { animations: [entrance, exit].filter((effect) => effect !== "none").map((effect) => ({ effect, trigger, durationMs: duration, delayMs: delay })) })}>Apply motion</RibbonButton>
  </div>;
  if (tab === "Arrange") return <div className="flex items-end gap-3 overflow-x-auto pb-1">
    {(["x", "y", "w", "h"] as const).map((key) => <Field key={key} label={`${key.toUpperCase()} %`} value={Math.round(box[key] * 1000) / 10} step={0.1} onChange={(value) => setBox((current) => ({ ...current, [key]: value / 100 }))} />)}
    <Field label="Rotate °" value={box.rot} min={-360} max={360} onChange={(rot) => setBox((current) => ({ ...current, rot }))} />
    {(element.kind === "shape" || element.kind === "text") && <label className="flex flex-col gap-1 text-[11px] text-[var(--md-on-surface-variant)]">Fill<input aria-label="Shape fill" type="color" value={fill} onChange={(event) => setFill(event.target.value)} /></label>}
    <RibbonButton disabled={busy} onClick={() => void onEdit(element.name, { ...box, ...(element.kind === "shape" ? { fill: fill.slice(1).toUpperCase() } : {}) })}>Apply</RibbonButton>
    <RibbonButton disabled={busy} onClick={() => void onEdit(element.name, { deleted: true })}>Delete</RibbonButton>
  </div>;
  return <p className="self-center text-sm text-[var(--md-on-surface-variant)]">{element.name}</p>;
}

function EditorPage({ image, elements, selected, onSelect, onEdit }: { image: string; elements: EditorElement[]; selected: EditorElement | null; onSelect: Props["onSelect"]; onEdit: Props["onEdit"] }) {
  const pageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; name: string; mode: "move" | "resize"; clientX: number; clientY: number; box: { x: number; y: number; w: number; h: number }; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const start = (event: PointerEvent<HTMLElement>, element: EditorElement, mode: "move" | "resize") => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const box = draft[element.name] ?? { x: element.x, y: element.y, w: element.w, h: element.h };
    gesture.current = { id: event.pointerId, name: element.name, mode, clientX: event.clientX, clientY: event.clientY, box, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(element);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    const page = pageRef.current;
    if (!g || !page || g.id !== event.pointerId) return;
    const rect = page.getBoundingClientRect();
    const dx = (event.clientX - g.clientX) / rect.width;
    const dy = (event.clientY - g.clientY) / rect.height;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) g.moved = true;
    const next = g.mode === "move" ? { ...g.box, x: Math.max(0, Math.min(1 - g.box.w, g.box.x + dx)), y: Math.max(0, Math.min(1 - g.box.h, g.box.y + dy)) }
      : { ...g.box, w: Math.max(0.02, Math.min(1 - g.box.x, g.box.w + dx)), h: Math.max(0.02, Math.min(1 - g.box.y, g.box.h + dy)) };
    setDraft((current) => ({ ...current, [g.name]: next }));
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (g.moved) {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = (event.clientX - g.clientX) / rect.width;
      const dy = (event.clientY - g.clientY) / rect.height;
      const next = g.mode === "move" ? { ...g.box, x: Math.max(0, Math.min(1 - g.box.w, g.box.x + dx)), y: Math.max(0, Math.min(1 - g.box.h, g.box.y + dy)) }
        : { ...g.box, w: Math.max(0.02, Math.min(1 - g.box.x, g.box.w + dx)), h: Math.max(0.02, Math.min(1 - g.box.y, g.box.h + dy)) };
      void onEdit(g.name, next);
    }
  };
  return <div ref={pageRef} className="relative aspect-[1333/750] max-w-[1333px] shrink-0 bg-white shadow-[0_28px_80px_rgba(0,0,0,.28)]" style={{ width: "min(100%, max(360px, calc((100dvh - 350px) * 1.7773)))" }} onClick={() => onSelect(null)}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image} alt="Slide page" className="absolute inset-0 h-full w-full" draggable={false} />
    {elements.filter((element) => element.w < 0.995 || element.h < 0.995).map((element) => {
      const box = draft[element.name] ?? element;
      const isSelected = selected?.id === element.id;
      return <button key={element.id} type="button" aria-label={`Select and move ${element.name}`} onClick={(event) => { event.stopPropagation(); onSelect(element); }}
        onPointerDown={(event) => start(event, element, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        className={`absolute touch-none border-2 ${isSelected ? "z-10 cursor-move border-[var(--md-primary)] bg-[color-mix(in_srgb,var(--md-primary)_6%,transparent)]" : "cursor-pointer border-transparent hover:border-[var(--md-tertiary)]"}`}
        style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, transform: element.rot ? `rotate(${element.rot}deg)` : undefined }}>
        {isSelected && <span onPointerDown={(event) => start(event, element, "resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="absolute -bottom-2 -right-2 block h-4 w-4 cursor-nwse-resize rounded-full border-2 border-[var(--md-primary)] bg-[var(--md-surface)]" aria-label="Resize element" />}
      </button>;
    })}
  </div>;
}

export default function FullEditor(props: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>("Home");
  const [chat, setChat] = useState("");
  const [transition, setTransition] = useState<string | null>(null);
  const slide = props.layout?.slides.find((item) => item.slide === props.active);
  const selected = props.selected;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = chat.trim();
    if (!text) return;
    setChat("");
    if (props.question) void props.onAnswer(text);
    else void props.onAsk(text, selected ? { slide: props.active, name: selected.name } : undefined);
  };
  return <section className="os-full-editor absolute inset-0 z-30 flex flex-col overflow-hidden text-[var(--md-on-surface)]" style={{ background: "var(--md-surface)" }} aria-label="Full slide editor">
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--md-outline-variant)] px-4 py-2">
      <button type="button" onClick={props.onClose} className="state btn btn-text neutral">← Studio</button>
      <div className="min-w-0 flex-1"><strong className="t-title-s">OctoSlides Editor</strong><span className="ml-3 text-xs text-[var(--md-on-surface-variant)]">Slide {props.active} of {props.slides.length}</span></div>
      {props.saving && <span className="text-xs text-[var(--md-on-surface-variant)]">Saving…</span>}
      <button type="button" onClick={props.onDownload} className="state btn btn-outlined">Download</button>
      <button type="button" onClick={props.onPresent} className="state btn btn-filled">Present</button>
    </header>
    <div className="shrink-0 border-b border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)] px-3">
      <div className="flex gap-1 border-b border-[var(--md-outline-variant)]">
        {TABS.map((item) => <button key={item} type="button" onClick={() => setTab(item)} aria-current={tab === item ? "page" : undefined} className={`state px-4 py-2 text-sm ${tab === item ? "border-b-2 border-[var(--md-primary)] text-[var(--md-primary)]" : "text-[var(--md-on-surface-variant)]"}`}>{item}</button>)}
      </div>
      <div className="flex h-[88px] items-center gap-2 overflow-x-auto px-1 py-2">
        {tab === "Insert" ? <><RibbonButton disabled={props.busy} onClick={() => void props.onAdd("text")}>＋ Text box</RibbonButton><RibbonButton disabled={props.busy} onClick={() => void props.onAdd("shape")}>▢ Shape</RibbonButton></> :
          tab === "Transitions" ? <><Select label="This slide" value={transition ?? slide?.transition ?? "fade"} choices={TRANSITIONS} onChange={setTransition} /><RibbonButton disabled={props.busy} onClick={() => void props.onTransition(transition ?? slide?.transition ?? "fade")}>Apply transition</RibbonButton><span className="text-xs text-[var(--md-on-surface-variant)]">Morph animates matching named objects between slides.</span></> :
          <SelectionRibbon key={`${props.active}:${selected?.id ?? "none"}:${tab}:${props.version}`} tab={tab} element={selected} onEdit={props.onEdit} busy={props.busy || props.saving} />}
      </div>
    </div>
    <div className="flex min-h-0 flex-1">
      <nav className="w-32 shrink-0 overflow-y-auto border-r border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)] p-2 sm:w-44" aria-label="Slide pages">
        {props.slides.map((number) => <button key={number} type="button" onClick={() => { props.setActive(number); props.onSelect(null); setTransition(null); }} aria-current={number === props.active ? "page" : undefined} className="mb-3 block w-full text-left">
          <span className="mb-1 block text-xs text-[var(--md-on-surface-variant)]">{number}</span>
          <span className={`block overflow-hidden rounded-[var(--md-shape-s)] border-2 ${number === props.active ? "border-[var(--md-primary)]" : "border-transparent"}`} style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {props.images[number] && <img src={props.images[number]} alt={`Slide ${number}`} className="h-full w-full object-cover" />}
          </span>
        </button>)}
      </nav>
      <div className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-[var(--md-surface-dim)] p-6 pb-28">
        {props.images[props.active] && <EditorPage key={`${props.active}:${props.images[props.active]}`} image={props.images[props.active]} elements={slide?.elements ?? []} selected={selected} onSelect={props.onSelect} onEdit={props.onEdit} />}
        <form onSubmit={submit} className="absolute bottom-5 left-1/2 z-20 flex w-[min(650px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--md-outline-variant)] bg-[var(--md-surface-container-high)] px-3 py-2 shadow-xl">
          <span className="rounded-full bg-[var(--md-primary-container)] px-2 py-1 text-xs text-[var(--md-on-primary-container)]">AI</span>
          <input value={chat} onChange={(event) => setChat(event.target.value)} aria-label="Ask the editor agent" placeholder={props.question ?? (selected ? `Ask about ${selected.name} on slide ${props.active}…` : `Ask about slide ${props.active}…`)} className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" />
          <button type="submit" disabled={!chat.trim()} aria-label="Send to editor agent" className="state btn btn-filled !h-9 !min-w-9 !px-2">↑</button>
        </form>
        {props.notice && <p role="alert" className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded bg-[var(--md-error-container)] px-3 py-2 text-sm text-[var(--md-on-error-container)]">{props.notice}</p>}
      </div>
      {tab === "Animations" && <aside className="hidden w-56 shrink-0 overflow-y-auto border-l border-[var(--md-outline-variant)] bg-[var(--md-surface-container-low)] p-3 lg:block" aria-label="Animation order">
        <h2 className="t-title-s mb-1">Animation order</h2>
        <p className="mb-3 text-xs text-[var(--md-on-surface-variant)]">Slide {props.active} · select an element to change its effects</p>
        {slide?.elements.flatMap((element) => (element.animations ?? []).map((animation) => ({ element, animation }))).map(({ element, animation }, index) =>
          <button key={`${element.id}-${index}`} type="button" onClick={() => props.onSelect(element)} className={`mb-1 flex w-full items-center gap-2 rounded-[var(--md-shape-s)] px-2 py-2 text-left text-xs ${selected?.id === element.id ? "bg-[var(--md-secondary-container)]" : "hover:bg-[var(--md-surface-container-high)]"}`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]">{index + 1}</span>
            <span className="min-w-0"><strong className="block truncate">{element.name}</strong><span className="text-[var(--md-on-surface-variant)]">{animation.effect} · {animation.durationMs ?? 650} ms</span></span>
          </button>)}
      </aside>}
    </div>
  </section>;
}
