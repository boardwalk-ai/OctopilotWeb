# Hein Agent

Hein is an assignment analysis agent for OctoPilot AI.

## Purpose
Hein receives the user's selected Major, Essay Type, and their assignment instructions.
She analyzes them and returns a structured JSON response containing:
- **analysis**: A comprehensive summary of what the assignment is asking
- **essayTopic**: The identified topic/subject of the essay
- **essayType**: The determined essay type (e.g., Inform, Argue, Analyze)
- **scope**: The scope of the essay (what it covers)
- **structure**: The recommended essay structure

## Model
- **Provider**: OpenRouter
- **Model**: Dynamic — pulled from backend `secondary_model` system setting (currently `google/gemini-3-flash-preview`)
- **API Key**: Random active key from the backend API key pool (`GET /api/v1/settings/api-keys`)
- **Response Format**: JSON only

## Trigger
Hein is triggered when the user presses the **Read** button on the Instructions page.

## Input
```json
{
  "major": "Selected major name",
  "essayType": "Selected essay type",
  "instructions": "User's assignment instructions text"
}
```

## Output
```json
{
  "analysis": "...",
  "essayTopic": "...",
  "essayType": "...",
  "scope": "...",
  "structure": "..."
}
```

## Architecture
1. `LunaService.fetchConfig()` → calls `GET /api/v1/settings/api-keys` to get random API key + current model
2. `LunaService.analyze()` → calls `/api/luna/analyze` (Next.js API route) with the key, model, and user data
3. `/api/luna/analyze` → proxies the request to OpenRouter with Hein's system prompt
4. Results are stored in the Organizer for the Outlines page to consume
