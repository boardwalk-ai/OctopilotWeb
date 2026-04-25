import type { Tool } from "../tools";

export const analyze_instruction: Tool<{
  instruction: string;
}> = {
  name: "analyze_instruction",
  description:
    "Analyze the user's deck instruction and extract topic, audience, tone, complexity, suggested slide count, and key themes.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["instruction"],
    properties: {
      instruction: { type: "string" },
    },
  },
  async execute(args) {
    const text = (args.instruction || "").trim();
    const lower = text.toLowerCase();

    const audience =
      lower.includes("board") ? "board" :
      lower.includes("investor") || lower.includes("pitch") ? "investor" :
      lower.includes("conference") || lower.includes("keynote") ? "conference" :
      lower.includes("client") ? "client" :
      lower.includes("internal") ? "internal" :
      "general";

    const tone =
      lower.includes("formal") || lower.includes("conservative") || lower.includes("corporate")
        ? "formal"
        : lower.includes("fun") || lower.includes("playful")
          ? "playful"
          : lower.includes("bold") || lower.includes("flashy")
            ? "bold"
            : "professional";

    const complexity =
      text.length > 400 ? "high" : text.length > 180 ? "medium" : "low";

    const suggestedCount =
      audience === "board" ? 9 :
      audience === "investor" ? 10 :
      audience === "conference" ? 8 :
      8;

    const keyThemes = extractThemes(text).slice(0, 8);

    return {
      topic: text.split("\n")[0]?.slice(0, 160) || text.slice(0, 160) || "Untitled deck",
      audience,
      tone,
      complexity,
      suggestedCount,
      keyThemes,
    };
  },
  stepTitle: () => "Analyze instruction",
};

function extractThemes(text: string): string[] {
  const cleaned = text
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .toLowerCase();

  const stop = new Set([
    "the","a","an","and","or","to","of","in","for","on","with","as","is","are","be","this","that","it",
    "slide","slides","deck","presentation","present","make","create","about",
  ]);

  const counts = new Map<string, number>();
  for (const raw of cleaned.split(/\s+/g)) {
    const w = raw.trim();
    if (w.length < 4) continue;
    if (stop.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

