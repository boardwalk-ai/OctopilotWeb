const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export class OctopilotAPIService {
  static async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: OctopilotAPIService.getHeaders(),
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  }

  static async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: OctopilotAPIService.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  }

  private static getHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
    };
  }
}
