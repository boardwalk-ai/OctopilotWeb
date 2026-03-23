import { AuthService } from "./AuthService";

function withAuthorization(init: RequestInit | undefined, authorization: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (authorization) {
    headers.set("Authorization", authorization);
  }

  return {
    ...init,
    headers,
  };
}

export async function fetchWithUserAuthorization(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const initialAuthorization = await AuthService.getAuthorizationHeader();
  let response = await fetch(input, withAuthorization(init, initialAuthorization));

  if (response.status === 401) {
    const refreshedAuthorization = await AuthService.getAuthorizationHeader(true);
    if (refreshedAuthorization && refreshedAuthorization !== initialAuthorization) {
      response = await fetch(input, withAuthorization(init, refreshedAuthorization));
    }
  }

  return response;
}
