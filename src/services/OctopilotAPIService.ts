import { AuthService } from "./AuthService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export class OctopilotAPIService {
  static async get<T>(endpoint: string): Promise<T> {
    const response = await OctopilotAPIService.fetchWithAuthRetry(`${API_BASE_URL}${endpoint}`, {
      headers: await OctopilotAPIService.getHeaders(),
    });
    return response.json();
  }

  static async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await OctopilotAPIService.fetchWithAuthRetry(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: await OctopilotAPIService.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  static async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await OctopilotAPIService.fetchWithAuthRetry(`${API_BASE_URL}${endpoint}`, {
      method: "PATCH",
      headers: await OctopilotAPIService.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  private static async getHeaders(): Promise<HeadersInit> {
    const authorization = await AuthService.getAuthorizationHeader();

    return {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    };
  }

  private static async fetchWithAuthRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let response = await fetch(input, init);
    if (response.status === 401) {
      const refreshedAuthorization = await AuthService.getAuthorizationHeader(true);
      if (refreshedAuthorization) {
        response = await fetch(input, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: refreshedAuthorization,
          },
        });
      }
    }

    if (!response.ok) {
      throw new Error(await OctopilotAPIService.getErrorMessage(response));
    }

    return response;
  }

  private static async getErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { detail?: string; message?: string };
      return payload.detail || payload.message || `API error: ${response.status}`;
    } catch {
      return `API error: ${response.status}`;
    }
  }
}
