import type { SlidesSSEEvent } from "@/types/slides";

// Encode a Slides event as an SSE frame. Browsers require the `data:` prefix
// and double newline terminator.
export function encodeSseFrame(event: SlidesSSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

