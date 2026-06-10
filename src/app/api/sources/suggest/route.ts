import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedRequest } from "@/server/routeAuth";
import { getOpenRouterConfig } from "@/server/backendConfig";
import { getHumanizerApiKey } from "@/server/backendConfig";

async function humanizeWithUndetectable(text: string, apiKey: string): Promise<string> {
  const submitRes = await fetch("https://humanize.undetectable.ai/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ content: text, readability: "High School", purpose: "Essay", strength: "More Human", model: "v11" }),
  });
  if (!submitRes.ok) return text;
  const { id } = await submitRes.json() as { id?: string };
  if (!id) return text;

  // Poll up to 20s
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const docRes = await fetch("https://humanize.undetectable.ai/document", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ id }),
    });
    if (!docRes.ok) break;
    const doc = await docRes.json() as { output?: string; status?: string };
    if (doc.output) return doc.output;
    if (doc.status === "failed") break;
  }
  return text;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthenticatedRequest(request);
  if ("response" in auth) return auth.response;

  const { sourceContent, sourceTitle, sourceUrl, essayContext, humanize } =
    await request.json() as {
      sourceContent: string;
      sourceTitle: string;
      sourceUrl: string;
      essayContext: string;
      humanize: boolean;
    };

  if (!sourceContent) return NextResponse.json({ error: "Missing sourceContent" }, { status: 400 });

  try {
    const { apiKey, model } = await getOpenRouterConfig("primary");

    const prompt = `You are a writing assistant. A student is writing an essay and is referencing the following source.

SOURCE TITLE: ${sourceTitle}
SOURCE URL: ${sourceUrl}
SOURCE EXCERPT:
${sourceContent.slice(0, 3000)}

${essayContext ? `STUDENT'S ESSAY SO FAR (last ~500 chars):
${essayContext.slice(-500)}

` : ""}Write ONE natural continuation sentence the student could write next in their essay that naturally incorporates or references information from this source. The sentence should flow naturally after whatever they have written. Write ONLY the sentence itself, no explanation, no quotes around it.`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 120 }),
    });

    if (!res.ok) return NextResponse.json({ error: "Model error" }, { status: 500 });
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    let suggestion = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (humanize && suggestion) {
      const humKey = await getHumanizerApiKey("undetectable");
      suggestion = await humanizeWithUndetectable(suggestion, humKey);
    }

    return NextResponse.json({ suggestion });
  } catch (err) {
    console.error("[suggest]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
