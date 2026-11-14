
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/server/db";
import { resolveDocumentUser } from "@/server/documentUser";
import type { DeckState } from "@/types/slides";

export const runtime = "nodejs";

type CreateDeckPayload = {
  title?: string;
  state?: DeckState;
};

function validState(value: unknown): value is DeckState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.deckId === "string" &&
    state.deckId.trim().length > 0 &&
    Array.isArray(state.slides)
  );
}

// GET /api/slides/decks
export async function GET(request: NextRequest) {
  try {
    const user = await resolveDocumentUser(request);
    if ("response" in user) return user.response;

    const decks = await query(
      `SELECT id, deck_id, title, created_at, updated_at,
              jsonb_array_length(
                CASE WHEN jsonb_typeof(state->'slides') = 'array'
                     THEN state->'slides'
                     ELSE '[]'::jsonb END
              ) AS slide_count
       FROM slide_decks
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 200`,
      [user.userId],
    );

    return NextResponse.json({ decks });
  } catch (error) {
    console.error("[slides/decks] GET:", error);
    return NextResponse.json(
      { error: "Failed to list presentations." },
      { status: 500 },
    );
  }
}

// POST /api/slides/decks
export async function POST(request: NextRequest) {
  try {
    const user = await resolveDocumentUser(request);
    if ("response" in user) return user.response;

    const body = (await request.json()) as CreateDeckPayload;

    if (!validState(body.state)) {
      return NextResponse.json(
        { error: "A valid deck state is required." },
        { status: 400 },
      );
    }

    const title = body.title?.trim() || "Untitled presentation";

    const rows = await query<{ id: string }>(
      `INSERT INTO slide_decks (user_id, deck_id, title, state)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, deck_id)
       DO UPDATE SET title = EXCLUDED.title, state = EXCLUDED.state
       RETURNING id`,
      [
        user.userId,
        body.state.deckId,
        title,
        JSON.stringify(body.state),
      ],
    );

    return NextResponse.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    console.error("[slides/decks] POST:", error);
    return NextResponse.json(
      { error: "Failed to save presentation." },
      { status: 500 },
    );
  }
}
