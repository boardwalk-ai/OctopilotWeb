# Aurora Agent

Aurora is an outline generation agent for OctoPilot AI.

## Purpose
Aurora generates essay outlines based on Luna's assignment analysis data.
She produces structured outline items (Introduction, Body Paragraph, Conclusion)
with titles and descriptions.

## Model
- **Provider**: OpenRouter
- **Model**: Dynamic — pulled from backend `secondary_model` system setting
- **API Key**: Random active key from the backend API key pool (`GET /api/v1/settings/keys`)
- **Response Format**: JSON only

## Trigger Modes
1. **Auto Outline** — Generates 5 outlines (1 intro, 3 body, 1 conclusion)
2. **Build My Way** — Generates 1 outline of the user-specified type + topic
3. **One Paragraph Only** — Generates 1 outline of the selected type (Intro / Body / Conclusion)

## Input
```json
{
  "analysis": "Luna's analysis text",
  "essayTopic": "...",
  "essayType": "...",
  "scope": "...",
  "structure": "...",
  "mode": "auto" | "build" | "single",
  "requestedType": "Introduction" | "Body Paragraph" | "Conclusion",
  "customTitle": "User-provided topic (Build My Way only)"
}
```

## Output
```json
{
  "outlines": [
    {
      "type": "Introduction" | "Body Paragraph" | "Conclusion",
      "title": "...",
      "description": "2-3 line description"
    }
  ]
}
```
