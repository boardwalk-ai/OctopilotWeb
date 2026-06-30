"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./training.module.css";

/* ----------------------------------------------------------------------------
   Content model — pure mentorship prose
   (in-room familiarity checks / stage directions are intentionally removed)
---------------------------------------------------------------------------- */

type Block =
  | { k: "p"; t: ReactNode }
  | { k: "quote"; t: string }
  | { k: "callout"; title: string; t: string }
  | { k: "code"; label?: string; lines: string[] }
  | { k: "map"; rows: [string, string][] }
  | { k: "list"; items: string[] };

type Section = { id: string; kicker: string; title: string; blocks: Block[] };

type Challenge = {
  n: number;
  kind: "Audit" | "Fill" | "Code";
  title: string;
  prompt: ReactNode;
  code?: string[];
  note?: ReactNode;
};

type Module = {
  id: string;
  num: string;
  title: string;
  live: boolean;
  sections: Section[];
  challenges: Challenge[];
};

/* ===================== SESSION 1 ===================== */
const SESSION1: Section[] = [
  {
    id: "s1-welcome", kicker: "Begin here", title: "Welcome to Session 1",
    blocks: [
      { k: "p", t: "This module is called Architectural Foundations, Dart Reading, and Git. By the end of it you'll be able to open a Flutter file you've never seen before and understand what it's doing." },
      { k: "p", t: "You haven't written Flutter before, and that's completely fine. We're going to lean hard on what you already know — React and TypeScript — and show you exactly where the new ideas fit." },
    ],
  },
  {
    id: "s1-who", kicker: "Orientation", title: "Who we are, and what we actually teach",
    blocks: [
      { k: "p", t: "We are a tech company that sells AI tools, and we use AI in our own development every day. It's the AI era — writing code line by line, by hand, from memory, is a waste of time now. The machine produces code faster than any of us can type." },
      { k: "p", t: "So the developer's role has shifted: you're not here to be a coder. You're here to be a code reviewer and a builder — an engineer who assembles, judges, and corrects what the AI produces." },
      { k: "quote", t: "We are not teaching you Dart. We are teaching you how to Dart." },
      { k: "p", t: "“How to Dart” means how to move through Flutter code: how to read it, how to spot when the AI got it wrong, how to fix it, and how to ship something that works. You're the pilot, not the engine. Three skills carry the whole program: read the code, judge whether it's correct, assemble the working result." },
      { k: "quote", t: "If you can't explain why the code is right or wrong, you don't ship it." },
    ],
  },
  {
    id: "s1-declarative", kicker: "The Paradigm Shift", title: "You already think declaratively",
    blocks: [
      { k: "p", t: "The most important idea in React is also the most important idea in Flutter, and you already own it: the UI is a function of state. You describe what the screen should look like for a given set of data, and the framework draws it. When the data changes, it redraws." },
      { k: "code", label: "React / TSX", lines: ["function Hello({ name }) {", "  return (", "    <Text>Hello {name}</Text>", "  );", "}"] },
      { k: "code", label: "Flutter / Dart", lines: ["class Hello extends StatelessWidget {", "  Widget build(context) {", "    return Text('Hello $name');", "  }", "}"] },
      { k: "p", t: "Different words — class instead of function, build instead of the function body, a Text widget instead of JSX — but the same shape: given data, return a description of the UI. build is simply Flutter's render." },
    ],
  },
  {
    id: "s1-render", kicker: "The Paradigm Shift", title: "How the screen is drawn",
    blocks: [
      { k: "p", t: "React on the web outputs HTML and CSS into the browser's DOM; the browser does the drawing, so how your app looks can depend on the browser. Flutter ships its own rendering engine — Skia, and the newer Impeller — and paints every pixel itself onto a blank canvas. No HTML, no CSS, no DOM. The consequence: a Flutter app looks identical on every device." },
      { k: "callout", title: "What this means for you", t: "There is no CSS. Styling lives inside the widget as properties you pass in. When you audit Flutter code and go looking for a CSS file, there isn't one. That's not a bug; that's Flutter." },
    ],
  },
  {
    id: "s1-translate", kicker: "The Paradigm Shift", title: "React → Flutter, translated",
    blocks: [
      { k: "p", t: "Keep this map close. The left is what you already know; the right is the Flutter word for the same thing. Learn the shape, not the spelling." },
      { k: "map", rows: [["Component", "Widget"], ["JSX markup", "Dart widget tree"], ["props", "constructor parameters"], ["useState / hooks", "StatefulWidget + setState"], ["CSS / styled", "widget properties"], ["package.json", "pubspec.yaml"], ["npm install", "flutter pub get"]] },
    ],
  },
  {
    id: "s1-dart", kicker: "Dart Reading", title: "The three things you'll read everywhere",
    blocks: [
      { k: "p", t: "We're not teaching you to write Dart from a blank page — we're teaching you to read it. Three things show up in almost every file: types and null safety, classes with named parameters, and async." },
      { k: "code", label: "types & null safety", lines: ["String name = 'Lucas';   // non-null text", "String? nickname;        // CAN be null", "int count = nickname!.length;  // '!' = trust me, not null", "late String token;       // set before first use"] },
      { k: "p", t: "The question mark means the value is allowed to be null. The exclamation mark forces “not null” and crashes if you're wrong. late means “I'll set it before I use it.” The single most common bug all month is a nullable value used without handling the null case." },
      { k: "code", label: "classes & named params", lines: ["class TopicCard extends StatelessWidget {", "  final String title;", "  const TopicCard({ required this.title });", "}", "TopicCard(title: 'DNA')   // arguments are named"] },
      { k: "p", t: "Widgets are classes, constructors use named parameters in curly braces, and required means mandatory. A Future is a value that arrives later (like a JS Promise); you await it. Forget await and you hold the Future, not the value." },
    ],
  },
  {
    id: "s1-git", kicker: "Git & Teamwork", title: "How we work together",
    blocks: [
      { k: "p", t: "main is the clean, always-working version of the app. You never commit directly to it — you branch off main, work there, and open a Pull Request. It's reviewed twice — automated CI checks and a human Lead — and only then merges. A commit is a labeled snapshot; we use feat:, fix:, and chore: prefixes." },
      { k: "callout", title: "Merge conflicts — don't panic", t: "A conflict just means two people changed the same lines. Git marks both versions; you pick the correct result, delete the markers, and commit. When unsure, ask the Lead before forcing anything — and never force-push a shared branch." },
    ],
  },
];

/* ===================== SESSION 2 ===================== */
const SESSION2: Section[] = [
  {
    id: "s2-recap", kicker: "Where we go now", title: "From reading to debugging",
    blocks: [
      { k: "p", t: "In Session 1 you learned to read Flutter. This module is about how it works while it runs — so you can debug it. The worst AI-generated bugs aren't spelling mistakes you can see by reading; they're runtime bugs that compile fine, look fine, and then leak memory or crash the layout when the app actually runs." },
      { k: "quote", t: "Reading told you what the code says. Now you learn what it does while it runs." },
    ],
  },
  {
    id: "s2-trees", kicker: "The Three Trees", title: "What you wrote, what's alive, what's painted",
    blocks: [
      { k: "p", t: "The single most useful mental model in Flutter: while your app runs, Flutter keeps three parallel trees in sync, each with a different job. Separating them is what makes Flutter both fast and debuggable." },
      { k: "list", items: ["Widget Tree — configuration. What you wrote: immutable, cheap, rebuilt often.", "Element Tree — the living layer. What's alive: holds your state, links the other two.", "RenderObject Tree — layout & paint. What's drawn: measures, positions, paints pixels."] },
      { k: "p", t: "Because widgets are cheap throwaways, Flutter can rebuild them many times a second without redrawing everything — the Element layer decides what actually changes. Knowing which tree a bug lives in is how you reason about it." },
    ],
  },
  {
    id: "s2-widget", kicker: "The Three Trees", title: "Widget Tree — configuration",
    blocks: [
      { k: "p", t: "A widget is just a description of the UI for a given state — a blueprint. It holds no live state and paints no pixels; it only describes. Because it's immutable and cheap, Flutter throws widgets away and rebuilds them constantly. That is normal, not wasteful." },
      { k: "callout", title: "Audit note", t: "If someone — human or AI — claims “it's slow because the widget rebuilds,” be skeptical. Rebuilding widgets is cheap by design. The expensive layer is rendering, not the widget." },
    ],
  },
  {
    id: "s2-element", kicker: "The Three Trees", title: "Element Tree — the living layer",
    blocks: [
      { k: "p", t: "For every widget, Flutter creates an Element — the long-lived object that stays mounted on screen. While widgets come and go on every rebuild, the Element persists, and critically, it holds your State. On a rebuild, the Element decides whether to reuse itself and update, or tear down and rebuild." },
      { k: "p", t: "That is how your state survives a rebuild — your scroll position, your typed text, your score all live in the Element layer, not the widget. The Element is the bridge: it links the throwaway Widget to the heavy RenderObject." },
    ],
  },
  {
    id: "s2-render", kicker: "The Three Trees", title: "RenderObject Tree — layout & paint",
    blocks: [
      { k: "p", t: "The heavy layer that does the real work: measure, position, and paint. This is where Flutter follows its golden rule of layout." },
      { k: "quote", t: "Constraints go down. Sizes go up. Parent sets position." },
      { k: "p", t: "The parent passes constraints down (“you can be up to 360 wide”). The child decides its size and passes it back up (“then I'll be 360 × 120”). The parent then positions the child. Break that flow and you get a layout crash — which is exactly one of the AI failure modes below." },
    ],
  },
  {
    id: "s2-stateful", kicker: "State & Lifecycle", title: "Stateless vs Stateful",
    blocks: [
      { k: "p", t: "A StatelessWidget draws once from the data it's handed; it has no internal data that changes. A TopicCard that just shows a title is stateless — same input, same output." },
      { k: "p", t: "A StatefulWidget holds data that changes over time and can call setState to rebuild itself: a quiz tracking a score, a text field, a timer, anything animated or streaming. The key difference: a StatefulWidget has a State object and a lifecycle you must manage — and managing it wrong is the bug." },
    ],
  },
  {
    id: "s2-lifecycle", kicker: "State & Lifecycle", title: "initState → build → dispose",
    blocks: [
      { k: "p", t: "A StatefulWidget has three moments that matter most. initState runs once, at birth — set things up here. build runs often, on every rebuild — keep it cheap and just describe the UI. dispose runs once, at removal — clean up here." },
      { k: "code", label: "the lifecycle", lines: ["void initState() { super.initState(); _ctrl = TextEditingController(); }  // once", "Widget build(ctx) { return TextField(controller: _ctrl); }               // many", "void dispose() { _ctrl.dispose(); super.dispose(); }                      // once"] },
      { k: "quote", t: "What you OPEN in initState, you must CLOSE in dispose." },
    ],
  },
  {
    id: "s2-leaks", kicker: "State & Lifecycle", title: "Memory leaks: forgetting dispose()",
    blocks: [
      { k: "p", t: "This is the number one lifecycle bug, and AI produces it constantly. A controller created in initState but never closed leaks every time the widget is rebuilt or removed. They pile up — the app slowly bloats, janks, and can crash." },
      { k: "code", label: "leaks — opened, never closed", lines: ["void initState() {", "  super.initState();", "  _scroll = ScrollController();   // opened", "}", "// no dispose() -> the controller leaks"] },
      { k: "callout", title: "Your audit reflex", t: "The moment you see a Controller, StreamSubscription, or AnimationController created in AI code, scroll straight to dispose() and confirm it's closed. No dispose, or not closed there? You've found a leak. The AI forgets this almost every time." },
    ],
  },
  {
    id: "s2-async", kicker: "Async & the UI Thread", title: "Don't block the one thread that draws",
    blocks: [
      { k: "p", t: "Flutter builds and paints on a single main thread, aiming for about 60 frames a second. Do something slow directly on it — a heavy loop, or waiting on the network the wrong way — and you blow the frame budget; the screen freezes and stops responding to taps and scroll." },
      { k: "code", label: "async — UI stays smooth", lines: ["Future<void> loadFeed() async {", "  setState(() => _loading = true);", "  final res = await api.get('/feed');   // awaits off the critical path", "  setState(() { _items = res.items; _loading = false; });", "}"] },
      { k: "callout", title: "Audit reflex", t: "A network or file call with no await — or a giant loop inside build() — is a red flag. Without await you also get a Future instead of the value (Session 1's bug). Same keyword, two ways it bites." },
    ],
  },
  {
    id: "s2-modes", kicker: "The Heart", title: "The three AI failure modes",
    blocks: [
      { k: "p", t: "Everything above was so you could understand this: the three specific ways AI-generated Flutter fails most often. This is your daily hunt." },
      { k: "list", items: ["Unbounded layout — a greedy scrolling child (ListView) inside an unbounded parent (Column/Row) → layout crash.", "Memory leaks — controllers, streams, listeners created but never closed in dispose().", "Hallucinated syntax — outdated or invented package names, methods, and parameters that don't exist."] },
      { k: "p", t: "These map exactly to today's theory: layout (RenderObject + the golden rule), lifecycle (initState/dispose), and verification (read it, don't trust it)." },
    ],
  },
  {
    id: "s2-crash", kicker: "The Heart", title: "The unbounded-constraint crash, up close",
    blocks: [
      { k: "p", t: "A Column tells its children “you can be as tall as you want” — unbounded height. A ListView also wants unbounded height to scroll. So you have a parent offering infinite height and a child demanding infinite height, and nobody can decide a size. Flutter crashes." },
      { k: "code", label: "broken → fixed", lines: ["Column(children: [ Header(), ListView(children: items) ])       // crash", "", "Column(children: [ Header(), Expanded(child: ListView(...)) ])   // fixed"] },
      { k: "callout", title: "What you'll see & the fix", t: "The error reads like “Vertical viewport was given unbounded height” or a RenderFlex overflow. Expanded says “take exactly the leftover space,” giving the ListView a bounded height to live in. Constraints down, sizes up — the flow works again." },
    ],
  },
  {
    id: "s2-next", kicker: "Where we go next", title: "From auditing to building",
    blocks: [
      { k: "p", t: "You now know Flutter keeps three trees, the lifecycle of open-and-close, that the UI runs on one thread you mustn't block, and the three ways AI code fails. Next we start building real UI with AI — mock data, modular widgets, and animation — using everything you can now audit." },
    ],
  },
];

/* ===================== SESSION 2 — 10 CHALLENGES ===================== */
const SESSION2_CHALLENGES: Challenge[] = [
  {
    n: 1, kind: "Audit", title: "The leaky animation",
    prompt: "This widget animates a spinner but something is missing. Find the bug, name the failure mode, and write the fix.",
    code: [
      "class _SpinnerState extends State<Spinner>",
      "    with SingleTickerProviderStateMixin {",
      "  late final AnimationController _c;",
      "",
      "  void initState() {",
      "    super.initState();",
      "    _c = AnimationController(vsync: this, duration: oneSecond)..repeat();",
      "  }",
      "",
      "  Widget build(BuildContext context) => RotationTransition(turns: _c, child: icon);",
      "  // ??? ",
      "}",
    ],
  },
  {
    n: 2, kind: "Audit", title: "The list that crashes",
    prompt: "This screen throws “Vertical viewport was given unbounded height” at runtime. Explain WHY, then fix it.",
    code: [
      "Column(",
      "  children: [",
      "    Text('My feed'),",
      "    ListView(children: posts),  // crashes here",
      "  ],",
      ")",
    ],
  },
  {
    n: 3, kind: "Audit", title: "The frozen screen",
    prompt: "Users report the app “hangs” for a second when this screen opens, and the data is sometimes empty. Identify both problems and rewrite it correctly.",
    code: [
      "Widget build(BuildContext context) {",
      "  final res = api.get('/feed');      // no await",
      "  for (var i = 0; i < 5000000; i++) {} // busy work",
      "  return Text(res.body);",
      "}",
    ],
  },
  {
    n: 4, kind: "Audit", title: "Reborn every frame",
    prompt: "A teammate says this controller “acts weird and the scroll keeps resetting.” Spot the bug, explain which tree/lifecycle rule it breaks, and fix it.",
    code: [
      "Widget build(BuildContext context) {",
      "  final scroll = ScrollController();   // created in build()",
      "  return ListView(controller: scroll, children: items);",
      "}",
    ],
  },
  {
    n: 5, kind: "Fill", title: "Complete the lifecycle",
    prompt: "Fill each blank so the resource is opened once and closed once. The comments define the goal.",
    code: [
      "class _ClockState extends State<Clock> {",
      "  late final Timer _timer;",
      "",
      "  void ______() {                 // runs once, at birth",
      "    super.initState();",
      "    _timer = Timer.periodic(oneSecond, _tick);",
      "  }",
      "",
      "  void ______() {                 // runs once, at removal",
      "    _timer.cancel();",
      "    super.________();             // always call this last",
      "  }",
      "}",
    ],
  },
  {
    n: 6, kind: "Fill", title: "Bound the scroll",
    prompt: "The ListView must scroll inside the Column without crashing. Fill the blank with the widget that gives it the leftover space.",
    code: [
      "Column(",
      "  children: [",
      "    Header(),",
      "    ________(                    // take the remaining height",
      "      child: ListView(children: items),",
      "    ),",
      "  ],",
      ")",
    ],
  },
  {
    n: 7, kind: "Fill", title: "Keep the UI smooth",
    prompt: "This must fetch without freezing the UI thread. Fill in the two keywords that make a function asynchronous and wait for a Future.",
    code: [
      "Future<String> loadName() ______ {   // mark it asynchronous",
      "  final res = ______ api.get('/me');  // wait for the value",
      "  return res.body;",
      "}",
    ],
  },
  {
    n: 8, kind: "Code", title: "Combine two Futures",
    prompt: (
      <>Write a Dart function <code>loadProfile()</code> that fetches a name and an avatar URL from two separate async calls <em>at the same time</em> (look into <code>Future.wait</code>), then returns them together as a single object/record.</>
    ),
    note: (
      <>Use AI to help — but <b>read every line and explain it in your own words</b>: what is a <code>Future</code>, what does <code>await</code> do, and why is fetching both at once better than one after the other? If you can&apos;t explain it, you haven&apos;t finished.</>
    ),
  },
  {
    n: 9, kind: "Code", title: "A self-cleaning ticker",
    prompt: (
      <>Build a <code>StatefulWidget</code> called <code>Ticker</code> that shows a number counting up every second using <code>Timer.periodic</code>. Start the timer in <code>initState</code>, update with <code>setState</code>, and cancel it in <code>dispose</code>.</>
    ),
    note: (
      <>Have AI scaffold it, then <b>explain in your own words</b>: why does the timer start in <code>initState</code> and not <code>build</code>, and what exactly leaks if you delete <code>dispose</code>?</>
    ),
  },
  {
    n: 10, kind: "Code", title: "Async feed screen",
    prompt: (
      <>Build a <code>FeedScreen</code> that loads a <code>List&lt;String&gt;</code> from an async source, shows a loading spinner while it waits, then displays the items in a scrollable list <em>inside a Column with a header</em> — without the unbounded-height crash.</>
    ),
    note: (
      <>AI will write most of it. Your job: <b>explain in your own words</b> why the list needs <code>Expanded</code>, where the <code>await</code> goes, and which lifecycle method cleans up if you add a controller.</>
    ),
  },
];

const MODULES: Module[] = [
  { id: "s1", num: "01", title: "Architectural Foundations, Dart Reading & Git", live: true, sections: SESSION1, challenges: [] },
  { id: "s2", num: "02", title: "Flutter Runtime Mechanics & Code Auditing", live: true, sections: SESSION2, challenges: SESSION2_CHALLENGES },
];

/* ---- tiny Dart syntax highlighter ---- */
const TOKEN = /('[^']*'|\b(?:class|extends|final|const|late|return|required|await|async|import|this|true|false|null|void|with|for|var)\b|\b(?:String|int|bool|double|Widget|Future|Timer|BuildContext|StatelessWidget|StatefulWidget|State|AnimationController|ScrollController|TextEditingController|Column|ListView|Expanded|Text|Header|Card)\b|\b\d+\b)/g;

function highlight(code: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const tok = m[0];
    let cls = styles.kw;
    if (tok.startsWith("'")) cls = styles.str;
    else if (/^\d+$/.test(tok)) cls = styles.num;
    else if (/^[A-Z]/.test(tok)) cls = styles.typ;
    out.push(<span key={`${keyPrefix}-${i++}`} className={cls}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function CodeLine({ line, lk }: { line: string; lk: string }) {
  const ci = line.indexOf("//");
  if (ci >= 0) {
    return (
      <>
        {highlight(line.slice(0, ci), lk)}
        <span className={styles.cm}>{line.slice(ci)}</span>
        {"\n"}
      </>
    );
  }
  return <>{highlight(line, lk)}{"\n"}</>;
}

function CodeCard({ label, lines }: { label?: string; lines: string[] }) {
  return (
    <div className={styles.code}>
      <div className={styles.codeBar}>
        <span className={styles.dot} style={{ background: "#ff5f57" }} />
        <span className={styles.dot} style={{ background: "#febc2e" }} />
        <span className={styles.dot} style={{ background: "#28c840" }} />
        {label && <span className={styles.codeLabel}>{label}</span>}
      </div>
      <pre className={styles.codePre}>
        {lines.map((ln, j) => <CodeLine key={`l${j}`} line={ln} lk={`l${j}`} />)}
      </pre>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className={styles.check} viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path d="M5 12.5l4 4 10-10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function renderBlock(b: Block, sid: string, idx: number): ReactNode {
  const key = `${sid}-b${idx}`;
  switch (b.k) {
    case "p": return <p key={key} className={styles.p}>{b.t}</p>;
    case "quote": return <p key={key} className={styles.quote}>{b.t}</p>;
    case "callout":
      return (
        <div key={key} className={styles.callout}>
          <div className={styles.calloutTitle}>{b.title}</div>
          <p className={styles.calloutText}>{b.t}</p>
        </div>
      );
    case "code": return <div key={key}><CodeCard label={b.label} lines={b.lines} /></div>;
    case "map":
      return (
        <div key={key} className={styles.map}>
          {b.rows.map((r, j) => (
            <div key={`${key}-r${j}`} className={styles.mapRow}>
              <span className={styles.mapL}>{r[0]}</span>
              <span className={styles.mapArrow}>→</span>
              <span className={styles.mapR}>{r[1]}</span>
            </div>
          ))}
        </div>
      );
    case "list":
      return (
        <div key={key} className={styles.list}>
          {b.items.map((it, j) => (
            <div key={`${key}-i${j}`} className={styles.listItem}><CheckIcon /><span>{it}</span></div>
          ))}
        </div>
      );
  }
}

const BADGE: Record<Challenge["kind"], { cls: string; label: string }> = {
  Audit: { cls: styles.badgeAudit, label: "Audit" },
  Fill: { cls: styles.badgeFill, label: "Fill in the blank" },
  Code: { cls: styles.badgeCode, label: "Coding" },
};

export default function TrainingProgramsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [activeMod, setActiveMod] = useState<string>("s2");
  const [active, setActive] = useState<string>("");

  const mod = MODULES.find((m) => m.id === activeMod) ?? MODULES[0];

  // reading progress + cursor glow (mount once)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    const onMove = (e: MouseEvent) => {
      el.style.setProperty("--gx", `${e.clientX}px`);
      el.style.setProperty("--gy", `${e.clientY}px`);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("mousemove", onMove);
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("mousemove", onMove);
    };
  }, []);

  // reveal + scrollspy — re-run when the active module changes
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const revealObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) { e.target.classList.add(styles.in); revealObs.unobserve(e.target); }
        }
      },
      { root, threshold: 0.12 }
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => revealObs.observe(el));

    const spyObs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    root.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => spyObs.observe(el));

    return () => { revealObs.disconnect(); spyObs.disconnect(); };
  }, [activeMod]);

  const goTo = (id: string) => {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`#${id}`);
    if (root && target) root.scrollTo({ top: target.offsetTop - 24, behavior: "smooth" });
  };

  const switchMod = (id: string) => {
    if (id === activeMod) return;
    setActiveMod(id);
    setActive("");
    const root = scrollRef.current;
    const banner = root?.querySelector<HTMLElement>("#program");
    if (root && banner) root.scrollTo({ top: banner.offsetTop - 12, behavior: "smooth" });
  };

  return (
    <div ref={scrollRef} className={styles.scroll}>
      <div className={styles.progress} style={{ transform: `scaleX(${progress})` }} />

      <div className={styles.bg} aria-hidden>
        <div className={styles.grid} />
        <div className={`${styles.haze} ${styles.hazeA}`} />
        <div className={`${styles.haze} ${styles.hazeB}`} />
        <div className={`${styles.haze} ${styles.hazeC}`} />
        <div className={styles.noise} />
      </div>
      <div className={styles.glow} aria-hidden />

      {/* HERO */}
      <header className={styles.hero}>
        <span className={styles.eyebrow}><span className={styles.eyebrowDot} />OctoPilot · Developer Enablement</span>
        <h1 className={styles.heroTitle}>Training<br />Programs</h1>
        <p className={styles.heroSub}>Structured, mentor-led tracks that turn capable engineers into AI-augmented builders — fast.</p>
        <div className={styles.heroMeta}>
          <span className={styles.metaPill}>Flutter Intern Program</span>
          <span className={styles.metaPill}>Mentorship format</span>
          <span className={styles.metaPill}>Audit-first</span>
        </div>
        <span className={styles.scrollCue}><span className={styles.scrollCueLine} /> Scroll to begin</span>
      </header>

      {/* PROGRAM BANNER + SESSION SWITCHER */}
      <section id="program" className={styles.program}>
        <div className={`${styles.programCard} ${styles.reveal}`} data-reveal>
          <div className={styles.programIndex}>Program 01 · Flutter</div>
          <h2 className={styles.programTitle}>{mod.title}</h2>
          <div className={styles.sessTabs} role="tablist">
            {MODULES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === activeMod}
                onClick={() => switchMod(m.id)}
                className={`${styles.sessTab} ${m.id === activeMod ? styles.sessTabActive : ""}`}
              >
                <span className={styles.sessTabNum}>{m.num}</span>
                <span className={styles.sessTabName}>{m.id === "s1" ? "Foundations & Dart" : "Runtime & Auditing"}</span>
                <span className={`${styles.sessTabTag} ${m.live ? styles.sessTagLive : ""}`}>{m.live ? "Live" : "Soon"}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* BODY */}
      <div className={styles.layout}>
        <aside className={styles.rail}>
          <div className={styles.railLabel}>Session {mod.num} · On this page</div>
          <ul className={styles.toc}>
            {mod.sections.map((s, i) => (
              <li key={s.id} className={styles.tocItem}>
                <button type="button" onClick={() => goTo(s.id)} className={`${styles.tocLink} ${active === s.id ? styles.tocActive : ""}`}>
                  <span className={styles.tocIdx}>{String(i + 1).padStart(2, "0")}</span>
                  <span>{s.title}</span>
                </button>
              </li>
            ))}
            {mod.challenges.length > 0 && (
              <li className={styles.tocItem}>
                <button type="button" onClick={() => goTo(`${mod.id}-lab`)} className={`${styles.tocLink} ${active === `${mod.id}-lab` ? styles.tocActive : ""}`}>
                  <span className={styles.tocIdx}>★</span>
                  <span>Challenge Lab</span>
                </button>
              </li>
            )}
          </ul>
        </aside>

        <article className={styles.article}>
          {mod.sections.map((s, i) => (
            <section key={s.id} id={s.id} data-section className={styles.section}>
              <div className={styles.reveal} data-reveal>
                <div className={styles.kicker}><span className={styles.kickerNum}>{String(i + 1).padStart(2, "0")}</span>{s.kicker}</div>
                <h2 className={styles.h2}>{s.title}</h2>
              </div>
              {s.blocks.map((b, j) => (
                <div key={`${s.id}-w${j}`} className={styles.reveal} data-reveal>{renderBlock(b, s.id, j)}</div>
              ))}
            </section>
          ))}

          {mod.challenges.length > 0 && (
            <section id={`${mod.id}-lab`} data-section className={styles.section}>
              <div className={styles.reveal} data-reveal>
                <div className={styles.kicker}><span className={styles.kickerNum}>★</span>Hands-on</div>
                <h2 className={styles.h2}>Challenge Lab</h2>
              </div>
              <div className={`${styles.chIntro} ${styles.reveal}`} data-reveal>
                <p className={styles.p}>Ten problems on everything in this session. Three flavours — and the same rule runs through all of them: you must be able to explain your answer in your own words.</p>
                <div className={styles.chLegend}>
                  <span className={`${styles.chBadge} ${styles.badgeAudit}`}>Audit · find the bug</span>
                  <span className={`${styles.chBadge} ${styles.badgeFill}`}>Fill in the blank</span>
                  <span className={`${styles.chBadge} ${styles.badgeCode}`}>Coding · build &amp; explain</span>
                </div>
              </div>
              <div className={styles.chGrid}>
                {mod.challenges.map((c) => (
                  <div key={c.n} className={`${styles.chCard} ${styles.reveal}`} data-reveal>
                    <div className={styles.chHead}>
                      <span className={styles.chNum}>{String(c.n).padStart(2, "0")}</span>
                      <span className={`${styles.chBadge} ${BADGE[c.kind].cls}`}>{BADGE[c.kind].label}</span>
                      <span className={styles.chTitle}>{c.title}</span>
                    </div>
                    <p className={styles.chPrompt}>{c.prompt}</p>
                    {c.code && <CodeCard lines={c.code} />}
                    {c.note && <div className={styles.chNote}>{c.note}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <p className={styles.footerNext}>
          <b>{activeMod === "s2" ? "Next:" : "Continue:"}</b>{" "}
          {activeMod === "s2"
            ? "building real UI with AI — mock data, modular widgets, and animation, using everything you can now audit."
            : "Session 02 — how Flutter works under the hood: the Three Trees, state & lifecycle, and the bugs they create."}
        </p>
        <div className={styles.brand}>
          <span className={styles.brandMark}><span className={styles.brandDot} /></span>
          OctoPilot
        </div>
      </footer>
    </div>
  );
}
