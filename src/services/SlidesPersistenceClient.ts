
import type { DeckState } from "@/types/slides";
import { fetchWithUserAuthorization } from "./authenticatedFetch";

export type SavedSlideDeck = {
  id: string;
  deck_id: string;
  title: string;
  slide_count: number;
  created_at: string;
  updated_at: string;
};

export type LoadedSlideDeck = {
  id: string;
  deck_id: string;
  title: string;
  state: DeckState;
  created_at: string;
  updated_at: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;

    throw new Error(message);
  }

  return body as T;
}

export class SlidesPersistenceClient {
  static async list(): Promise<SavedSlideDeck[]> {
    const response = await fetchWithUserAuthorization(
      "/api/slides/decks",
      { method: "GET", cache: "no-store" },
    );

    const data = await parseResponse<{
      decks: SavedSlideDeck[];
    }>(response);

    return data.decks;
  }

  static async save(
    title: string,
    state: DeckState,
  ): Promise<string> {
    const response = await fetchWithUserAuthorization(
      "/api/slides/decks",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, state }),
      },
    );

    const data = await parseResponse<{ id: string }>(response);
    return data.id;
  }

  static async load(id: string): Promise<LoadedSlideDeck> {
    const response = await fetchWithUserAuthorization(
        `/api/slides/decks/${encodeURIComponent(id)}`,
        { method: "GET", cache: "no-store" },
    );

    const data = await parseResponse<{ deck: LoadedSlideDeck }>(response);

    if (!data.deck || !Array.isArray(data.deck.state?.slides)) {
        throw new Error("The saved presentation has an invalid format.");
    }

    return data.deck;
    }

  static async update(
    id: string,
    title: string,
    state: DeckState,
  ): Promise<void> {
    const response = await fetchWithUserAuthorization(
      `/api/slides/decks/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, state }),
      },
    );

    await parseResponse<unknown>(response);
  }

  static async remove(id: string): Promise<void> {
    const response = await fetchWithUserAuthorization(
      `/api/slides/decks/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );

    await parseResponse<unknown>(response);
  }
}
