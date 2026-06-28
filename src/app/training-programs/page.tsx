"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./training.module.css";

/* ----------------------------------------------------------------------------
   Content model — Week 1, written as pure mentorship prose
   (the in-room familiarity checks / stage directions are intentionally removed)
---------------------------------------------------------------------------- */

type Block =
  | { k: "p"; t: ReactNode }
  | { k: "quote"; t: string }
  | { k: "callout"; title: string; t: string }
  | { k: "code"; label?: string; lines: string[] }
  | { k: "map"; rows: [string, string][] }
  | { k: "list"; items: string[] };

type Section = { id: string; kicker: string; title: string; blocks: Block[] };

const SECTIONS: Section[] = [
  {
    id: "welcome",
    kicker: "Begin here",
    title: "Welcome to Week 1",
    blocks: [
      { k: "p", t: "This week is called Architectural Foundations, Dart Reading, and Git. By the end of it you'll be able to open a Flutter file you've never seen before and understand what it's doing." },
      { k: "p", t: "You haven't written Flutter before, and that's completely fine. We're going to lean hard on what you already know — React and TypeScript — and I'll show you exactly where the new ideas fit. A lot of this will feel familiar; where it's different, I'll point it out clearly." },
    ],
  },
  {
    id: "who-we-are",
    kicker: "Orientation",
    title: "Who we are, and what we actually teach",
    blocks: [
      { k: "p", t: "Before any code, understand who we are, because it changes what this month is about. We are a tech company that sells AI tools. We use AI in our own development every single day — we practice what we sell." },
      { k: "p", t: "It's the AI era. Writing code line by line, by hand, from memory, is a waste of time now. The machine produces code faster than any of us can type. So the developer's role has shifted: you're not here to be a coder. You're here to be a code reviewer and a builder — an engineer who assembles, judges, and corrects what the AI produces." },
      { k: "quote", t: "We are not teaching you Dart. We are teaching you how to Dart." },
      { k: "p", t: "Learning Dart would mean memorizing syntax so you can write it from a blank page — the AI does that part now. “How to Dart” means how to move through Flutter code: how to read it, how to spot when the AI got it wrong, how to fix it, and how to ship something that works. You're the pilot, not the engine." },
      { k: "p", t: "Three skills carry the whole program: read the code, judge whether it's correct, and assemble the working result. And there is one rule for the entire month." },
      { k: "quote", t: "If you can't explain why the code is right or wrong, you don't ship it." },
      { k: "p", t: "The AI is like a very fast junior developer who is sometimes confidently, completely wrong. Your value is being the senior who catches that." },
    ],
  },
  {
    id: "paradigm",
    kicker: "Part 1 · The Paradigm Shift",
    title: "Get the mental model right first",
    blocks: [
      { k: "p", t: "Before any syntax, get the big picture: how is the Flutter world the same as React, and how is it different? If your mental model is right, the code starts to read itself. If it's wrong, every line fights you. This matters more than it looks." },
    ],
  },
  {
    id: "declarative",
    kicker: "Part 1",
    title: "You already think declaratively",
    blocks: [
      { k: "p", t: "The most important idea in React is also the most important idea in Flutter, and you already own it: the UI is a function of state. You describe what the screen should look like for a given set of data, and the framework draws it. When the data changes, it redraws. You never grab an element and move it by hand — you describe the result. That's React's philosophy, and it's Flutter's too." },
      { k: "code", label: "React / TSX", lines: [
        "function Hello({ name }) {",
        "  return (",
        "    <Text>Hello {name}</Text>",
        "  );",
        "}",
      ] },
      { k: "p", t: "On the left, React: a component — which is just a function — that takes a name and returns JSX showing “Hello name”. You've written this a hundred times." },
      { k: "code", label: "Flutter / Dart", lines: [
        "class Hello extends StatelessWidget {",
        "  Widget build(context) {",
        "    return Text('Hello $name');",
        "  }",
        "}",
      ] },
      { k: "p", t: "On the right, Flutter: a class with a build method that returns a Text widget saying “Hello name”. Different words — class instead of function, build instead of the function body, a Text widget instead of JSX — but the same shape: given data, return a description of the UI. The $name inside the quotes is string interpolation, exactly like a JavaScript template string. And build is simply Flutter's render." },
    ],
  },
  {
    id: "rendering",
    kicker: "Part 1",
    title: "How the screen is actually drawn",
    blocks: [
      { k: "p", t: "Now the first deep difference: how the screen actually gets painted. React on the web outputs HTML and CSS into the browser's DOM — the browser's live tree of elements. React keeps a lightweight copy, the Virtual DOM, works out what changed, and asks the browser to repaint those parts. The browser does the drawing, so how your app looks can depend on the browser and the platform." },
      { k: "p", t: "Flutter does something radically different. It ships its own rendering engine — Skia, and the newer one, Impeller. It does not use HTML, CSS, or the DOM. It paints every single pixel itself onto a blank canvas, closer to a game engine than a web page. The consequence: a Flutter app looks identical on every device." },
      { k: "callout", title: "What this means for you", t: "There is no CSS. Styling — padding, colors, fonts — lives inside the widget as properties you pass in, not in a separate stylesheet. So when you audit Flutter code and go looking for a CSS file, there isn't one. That's not a bug; that's Flutter." },
    ],
  },
  {
    id: "one-codebase",
    kicker: "Part 1",
    title: "One codebase, many targets",
    blocks: [
      { k: "p", t: "The second difference: one codebase, many targets. You write Dart once and Flutter compiles it to Android, iOS, web, and desktop. On mobile it's native ARM machine code, not a web page wrapped in an app. ARM is the processor your phone uses, so the code runs directly on the chip, which is fast. For web it compiles to JavaScript or WebAssembly (Wasm), a fast low-level format browsers can run." },
      { k: "callout", title: "Why it matters for auditing", t: "Because Flutter draws its own pixels and there's no per-platform CSS or browser quirks, the widget you read is exactly what renders everywhere. When something looks broken, it's a bug in the code in front of you — not some mysterious platform ghost. The code is the truth." },
    ],
  },
  {
    id: "translation",
    kicker: "Part 1",
    title: "React → Flutter, translated",
    blocks: [
      { k: "p", t: "Keep this map close. The left is what you already know; the right is the Flutter word for the same thing. Learn the shape, not the spelling." },
      { k: "map", rows: [
        ["Component", "Widget"],
        ["JSX markup", "Dart widget tree"],
        ["props", "constructor parameters"],
        ["useState / hooks", "StatefulWidget + setState"],
        ["CSS / styled", "widget properties"],
        ["package.json", "pubspec.yaml"],
        ["npm install", "flutter pub get"],
      ] },
      { k: "p", t: "flutter pub get downloads your dependencies, exactly like npm install. You already understood it — you just learned its Flutter name. When you read AI code this week and hit something unfamiliar, come back to this map and translate it into the React concept you already own." },
    ],
  },
  {
    id: "dart-intro",
    kicker: "Part 2 · Dart Reading",
    title: "Dart you can read",
    blocks: [
      { k: "p", t: "We're not teaching you to write Dart from a blank page — we're teaching you to read it, because you cannot audit code you can't read. Here are the three things you'll see in almost every file: types and null safety, classes with named parameters, and async. Read these three well and you can read most Flutter code you'll ever meet. We'll go slowly, line by line." },
    ],
  },
  {
    id: "types",
    kicker: "Part 2 · Essential 1 of 3",
    title: "Types & null safety",
    blocks: [
      { k: "code", label: "Dart", lines: [
        "String name = 'Lucas';   // non-null text",
        "String? nickname;        // CAN be null",
        "",
        "int count = nickname!.length;",
        "//                    ^ '!' = trust me, not null",
        "",
        "late String token;       // set before first use",
      ] },
      { k: "p", t: "Read it slowly. In String name = 'Lucas', String is the type — it means text; name is the variable, the label; the equals sign assigns the value; 'Lucas' in quotes is the text itself; and the semicolon ends the statement, same as JavaScript. A type in Dart is the same idea as TypeScript's string, number, boolean — Dart just enforces it at runtime too, so it's stricter." },
      { k: "p", t: "In String? nickname, that question mark is one of the most important characters in all of Dart. It means the value is allowed to be null. Null means nothing, no value, empty. Without the question mark Dart forces the value to always exist; with it, you're telling Dart this one could be empty." },
      { k: "p", t: "In nickname!.length, the exclamation mark means “I promise this is not null — trust me.” It's dangerous: if you're wrong and it really is null, the app crashes right there. Whenever you see a !, slow down and prove the value can't actually be null." },
      { k: "p", t: "And late String token means “I'll set this before I use it.” It's a promise. Break it — use it before setting it — and it crashes." },
      { k: "callout", title: "The bug you'll catch most", t: "The single most common bug all month is a nullable value used without handling the null case. The AI does this constantly." },
    ],
  },
  {
    id: "classes",
    kicker: "Part 2 · Essential 2 of 3",
    title: "Classes & named parameters",
    blocks: [
      { k: "code", label: "Dart", lines: [
        "class TopicCard extends StatelessWidget {",
        "  final String title;",
        "  final int mastery;",
        "",
        "  const TopicCard({",
        "    required this.title,   // must pass it",
        "    this.mastery = 0,      // optional, default 0",
        "  });",
        "}",
        "",
        "// usage — arguments are named:",
        "TopicCard(title: 'DNA', mastery: 40)",
      ] },
      { k: "p", t: "This is the shape of Flutter, because every widget is a class. class TopicCard extends StatelessWidget defines a widget called TopicCard. A class is a blueprint that bundles data and behavior together. extends StatelessWidget means it's a kind of widget — one whose content doesn't change over time (stateful versus stateless is next week)." },
      { k: "p", t: "final String title and final int mastery are the data the widget holds: text called title, a whole number called mastery. The word final means once set, it never changes; widget data is final because a widget's configuration is fixed once it's created. These two fields are the Flutter version of props." },
      { k: "p", t: "The constructor is what builds the object. The curly braces around the parameters make them named, so you pass arguments by name. required this.title means title is mandatory; this.mastery = 0 gives mastery a default, so it's optional. And the usage — TopicCard(title: 'DNA', mastery: 40) — passes arguments by name, just like props in React." },
      { k: "callout", title: "Recognize this shape", t: "Widgets are classes, constructors use named parameters in curly braces, and required means mandatory. A common AI mistake is forgetting required on a field that has no default." },
    ],
  },
  {
    id: "async",
    kicker: "Part 2 · Essential 3 of 3",
    title: "Future, async & await",
    blocks: [
      { k: "p", t: "Anything that takes time — a server call, reading a file — doesn't finish instantly. Dart represents “a value that will arrive later” with a type called Future, which is the same idea as a JavaScript Promise. If you know Promises, you're most of the way there." },
      { k: "code", label: "Dart", lines: [
        "Future<String> loadNotes() async {",
        "  final res = await api.get('/notes');",
        "  return res.body;",
        "}",
        "",
        "// the caller must await too:",
        "final notes = await loadNotes();",
      ] },
      { k: "p", t: "Future<String> loadNotes() async means this function will eventually return a String, but later; the async keyword marks it as doing work that takes time. await api.get('/notes') means pause here, wait for the result, then continue — because of await, the code reads top to bottom even though it's waiting. It returns the response body, the actual data. And the caller has to await it too, to get the real value out." },
      { k: "p", t: "Picture ordering food at a counter. They hand you a receipt with a number — that receipt is the Future, a promise of food, not the food yet. await is you waiting at the counter until your number is called and you get the actual dish." },
      { k: "callout", title: "The bug to catch", t: "Forget the await and it's like trying to eat the receipt — you're holding the Future object, not the value, and everything downstream breaks. Call loadNotes() without await and you get a Future, not the String." },
    ],
  },
  {
    id: "read-widget",
    kicker: "Part 2 · Putting it together",
    title: "Reading a real widget",
    blocks: [
      { k: "p", t: "Now let's combine all three and read a complete, real widget file, top to bottom. This is the skill to walk away with." },
      { k: "code", label: "lib/topic_card.dart", lines: [
        "import 'package:flutter/material.dart';   // 1",
        "",
        "class TopicCard extends StatelessWidget {  // 2",
        "  final String title;                      // 3",
        "  const TopicCard({required this.title});  // 4",
        "",
        "  Widget build(BuildContext context) {     // 5",
        "    return Card(",
        "      child: Text(title),                  // 6",
        "    );",
        "  }",
        "}",
      ] },
      { k: "p", t: "Line 1 — import pulls in code from elsewhere, like in JavaScript; this line pulls in Flutter's UI toolkit, Material, which is Google's design system, full of ready-made widgets. Almost every file starts with it. Line 2 — we define a widget, which is a class; stateless means it doesn't change over time. Line 3 — the data the widget needs: text called title, locked with final. Line 4 — the constructor; to make a TopicCard you must give it a title." },
      { k: "p", t: "Line 5 — the build method, where the UI is described and returned; this is your render. BuildContext context is information about where the widget sits in the app — its location and theme; you rarely touch it directly this week. Line 6 — it returns a Card, and inside it, as its child, a Text showing the title. In plain English: this widget draws a little card with the title written on it. Card contains Text — a widget inside a widget. That nesting is the widget tree, Flutter's version of nested JSX." },
      { k: "p", t: "That's a whole Flutter widget. Six ideas, nothing magic. By the end of the week you should be able to open a file like this and explain every line." },
    ],
  },
  {
    id: "git",
    kicker: "Part 3 · Git & Teamwork",
    title: "Git & how we work together",
    blocks: [
      { k: "p", t: "The code matters, but if we keep overwriting each other's work, we lose whole days. So we follow a simple, strict workflow. Picture main as the clean, always-working version of the app. It's protected, and you never commit directly to it. When you start a task you create a branch off main, named for the feature, like feature/quiz-card, and you do all your work there. If you break something on your branch, main stays clean — that's the whole point of branching." },
      { k: "p", t: "A commit is a labeled snapshot of your work. We use conventions: feat: for a new feature, fix: for a bug fix, chore: for maintenance. A clear message tells the Lead what changed at a glance, without opening the code." },
      { k: "code", label: "the daily loop", lines: [
        "git checkout -b feature/quiz-card   // branch + switch",
        "git add .                           // stage changes",
        "git commit -m \"feat: quiz card\"     // labeled snapshot",
        "git push                            // upload to GitHub",
      ] },
      { k: "p", t: "Your work gets into main through a Pull Request. You branch, commit, and push; you open a PR on GitHub; and it gets reviewed two ways — automated CI checks and a human Lead — and only then does it merge into main. CI stands for Continuous Integration: a robot that checks every PR, like formatting and tests; we build it ourselves in Week 4. Nothing reaches main without being checked twice, and you never merge your own code to main." },
      { k: "callout", title: "Merge conflicts — don't panic", t: "A conflict just means two people changed the same lines and Git can't decide which to keep. It marks both versions with <<<<<<<, =======, and >>>>>>>. You look at both, choose the correct final result, delete the marker lines, and commit. When you're not sure which version is right, ask the Lead before forcing anything — and never force-push a shared branch." },
    ],
  },
  {
    id: "ai-guardrails",
    kicker: "Part 4 · Working with AI",
    title: "Driving the AI without getting burned",
    blocks: [
      { k: "p", t: "Three habits make the AI help you instead of hurt you. First, feed it context. The AI hallucinates — makes things up — when it's guessing, so don't make it guess. Give it the real data: paste the actual schema you're working with so it uses the correct field names and types instead of inventing fields that don't exist. To hallucinate, in the AI sense, is to confidently produce something that looks right but is made up — a function that doesn't exist, a field name it invented. Catching exactly that is your job." },
      { k: "p", t: "Second, make small, specific asks. “Build one static Quiz card from this mock JSON” gives you clean, reviewable code; “build the quiz feature” gives you a pile of half-correct guesses you can't audit. Small scope, mock data, one widget at a time. Mock data is fake-but-realistic sample data, so you can build and test the UI without a real backend wired up — we lean on it heavily in Week 3." },
      { k: "quote", t: "Explain or reject. If you can't say why the code is correct, you don't merge it." },
    ],
  },
  {
    id: "audit",
    kicker: "Hands-on",
    title: "Audit Challenge #1",
    blocks: [
      { k: "p", t: "Now you apply it. Here's a small widget the AI produced, with three bugs planted in it. The goal is to find them — and, more importantly, to explain why each one is wrong." },
      { k: "code", label: "spot the bugs", lines: [
        "class TopicCard extends StatelessWidget {",
        "  String title;                 // a)",
        "  TopicCard({this.title});      // b)",
        "",
        "  Widget build(context) {",
        "    int m = mastery.length;     // c)",
        "    return Text(title);",
        "  }",
        "}",
      ] },
      { k: "p", t: "Bug (a): String title; should be final String title; — widget fields are final because the configuration shouldn't change after the widget is created. It's not a crash, but a good reviewer flags it. Bug (b): the constructor TopicCard({this.title}); is missing required — title has no default and the widget needs it, so it must be TopicCard({required this.title});. Without required, someone could build a card with no title and hit a null error." },
      { k: "p", t: "Bug (c): int m = mastery.length; has two problems. First, mastery is never defined anywhere in this class — the AI invented it. Second, even if it did exist, .length doesn't work on an int; length is for strings and lists, not numbers. That's a classic hallucination: an invented variable and a method that doesn't fit the type." },
      { k: "callout", title: "The real measure", t: "Your score is bugs caught over bugs planted — but the real skill is the explanation. Catching a bug by luck doesn't count; explaining why it's wrong does." },
    ],
  },
  {
    id: "deliverable",
    kicker: "Wrap-up",
    title: "What “done” looks like",
    blocks: [
      { k: "p", t: "Here's what “done” means for Week 1:" },
      { k: "list", items: [
        "Your local environment runs — Flutter, Git, and Cursor installed and working",
        "You can open a Dart file and explain it out loud",
        "You can map the key web vs mobile architectural differences",
        "You pass Audit Challenge #1",
      ] },
      { k: "p", t: "Hit those four and you are exactly where you need to be. Nobody expects you to write a Flutter app yet — reading it and judging it is this week's win." },
    ],
  },
  {
    id: "next",
    kicker: "Wrap-up",
    title: "Where we go next",
    blocks: [
      { k: "p", t: "Think about where you started — not knowing Flutter at all — and where you are now: you can open a widget, follow the types, the null safety, the constructor, the async, and say what the code does. That is a real skill, and it's the foundation everything else is built on." },
      { k: "p", t: "Next week we go under the hood — how Flutter actually works inside: the Three Trees, how state and lifecycle work, and the specific, sneaky bugs they create that you'll learn to hunt down." },
    ],
  },
];

/* ---- tiny Dart syntax highlighter ---- */
const TOKEN = /('[^']*'|\b(?:class|extends|final|const|late|return|required|await|async|import|this|true|false|null|void)\b|\b(?:String|int|bool|double|Widget|Future|BuildContext|StatelessWidget|StatefulWidget|Card|Text)\b|\b\d+\b)/g;

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
    else if (/^(String|int|bool|double|Widget|Future|BuildContext|StatelessWidget|StatefulWidget|Card|Text)$/.test(tok)) cls = styles.typ;
    out.push(<span key={`${keyPrefix}-${i++}`} className={cls}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function CodeLine({ line, lk }: { line: string; lk: string }) {
  const ci = line.indexOf("//");
  if (ci >= 0) {
    const codePart = line.slice(0, ci);
    const comment = line.slice(ci);
    return (
      <>
        {highlight(codePart, lk)}
        <span className={styles.cm}>{comment}</span>
        {"\n"}
      </>
    );
  }
  return <>{highlight(line, lk)}{"\n"}</>;
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
    case "p":
      return <p key={key} className={styles.p}>{b.t}</p>;
    case "quote":
      return <p key={key} className={styles.quote}>{b.t}</p>;
    case "callout":
      return (
        <div key={key} className={styles.callout}>
          <div className={styles.calloutTitle}>{b.title}</div>
          <p className={styles.calloutText}>{b.t}</p>
        </div>
      );
    case "code":
      return (
        <div key={key} className={styles.code}>
          <div className={styles.codeBar}>
            <span className={styles.dot} style={{ background: "#ff5f57" }} />
            <span className={styles.dot} style={{ background: "#febc2e" }} />
            <span className={styles.dot} style={{ background: "#28c840" }} />
            {b.label && <span className={styles.codeLabel}>{b.label}</span>}
          </div>
          <pre className={styles.codePre}>
            {b.lines.map((ln, j) => (
              <CodeLine key={`${key}-l${j}`} line={ln} lk={`${key}-l${j}`} />
            ))}
          </pre>
        </div>
      );
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
            <div key={`${key}-i${j}`} className={styles.listItem}>
              <CheckIcon />
              <span>{it}</span>
            </div>
          ))}
        </div>
      );
  }
}

export default function TrainingProgramsPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // reading progress + cursor glow
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

  // scroll-reveal + scrollspy
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const revealEls = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const revealObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(styles.in);
            revealObs.unobserve(e.target);
          }
        }
      },
      { root, threshold: 0.12 }
    );
    revealEls.forEach((el) => revealObs.observe(el));

    const sectionEls = Array.from(root.querySelectorAll<HTMLElement>("[data-section]"));
    const spyObs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    sectionEls.forEach((el) => spyObs.observe(el));

    return () => {
      revealObs.disconnect();
      spyObs.disconnect();
    };
  }, []);

  const goTo = (id: string) => {
    const root = scrollRef.current;
    const target = root?.querySelector<HTMLElement>(`#${id}`);
    if (root && target) {
      root.scrollTo({ top: target.offsetTop - 24, behavior: "smooth" });
    }
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
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} />
          OctoPilot · Developer Enablement
        </span>
        <h1 className={styles.heroTitle}>Training<br />Programs</h1>
        <p className={styles.heroSub}>
          Structured, mentor-led tracks that turn capable engineers into AI-augmented
          builders — fast.
        </p>
        <div className={styles.heroMeta}>
          <span className={styles.metaPill}>Flutter Intern Program</span>
          <span className={styles.metaPill}>4-week track</span>
          <span className={styles.metaPill}>Mentorship format</span>
        </div>
        <span className={styles.scrollCue}>
          <span className={styles.scrollCueLine} /> Scroll to begin
        </span>
      </header>

      {/* PROGRAM BANNER */}
      <section className={styles.program}>
        <div className={`${styles.programCard} ${styles.reveal}`} data-reveal>
          <div className={styles.programIndex}>Program 01</div>
          <h2 className={styles.programTitle}>Architectural Foundations, Dart Reading &amp; Git</h2>
          <div className={styles.weekRow}>
            <div className={`${styles.week} ${styles.weekActive}`}>
              <span className={styles.weekNum}>W1</span> Week 1
              <span className={styles.weekTag}>Live</span>
            </div>
            <div className={`${styles.week} ${styles.weekLocked}`}>
              <span className={styles.weekNum}>W2</span> Runtime &amp; Auditing
              <span className={styles.weekTag}>Soon</span>
            </div>
            <div className={`${styles.week} ${styles.weekLocked}`}>
              <span className={styles.weekNum}>W3</span> UI &amp; Mock Data
              <span className={styles.weekTag}>Soon</span>
            </div>
            <div className={`${styles.week} ${styles.weekLocked}`}>
              <span className={styles.weekNum}>W4</span> DevOps &amp; CI
              <span className={styles.weekTag}>Soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* BODY */}
      <div className={styles.layout}>
        <aside className={styles.rail}>
          <div className={styles.railLabel}>Week 1 · On this page</div>
          <ul className={styles.toc}>
            {SECTIONS.map((s, i) => (
              <li key={s.id} className={styles.tocItem}>
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  className={`${styles.tocLink} ${active === s.id ? styles.tocActive : ""}`}
                >
                  <span className={styles.tocIdx}>{String(i + 1).padStart(2, "0")}</span>
                  <span>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className={styles.article}>
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} data-section className={styles.section}>
              <div className={`${styles.reveal}`} data-reveal>
                <div className={styles.kicker}>
                  <span className={styles.kickerNum}>{String(i + 1).padStart(2, "0")}</span>
                  {s.kicker}
                </div>
                <h2 className={styles.h2}>{s.title}</h2>
              </div>
              {s.blocks.map((b, j) => (
                <div key={`${s.id}-w${j}`} className={`${styles.reveal}`} data-reveal>
                  {renderBlock(b, s.id, j)}
                </div>
              ))}
            </section>
          ))}
        </article>
      </div>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <p className={styles.footerNext}>
          <b>Next — Week 2:</b> how Flutter works under the hood — the Three Trees, state
          &amp; lifecycle, and the bugs they create.
        </p>
        <div className={styles.brand}>
          <span className={styles.brandMark}><span className={styles.brandDot} /></span>
          OctoPilot
        </div>
      </footer>
    </div>
  );
}
