// Central REST client for the CloudGuard backend.
//
// The backend base URL comes from VITE_API_URL so it can be changed through
// environment variables without touching application code. All API modules
// route their requests through this client.

export const BASE_URL = (import.meta.env["VITE_API_URL"] ?? "").toString().replace(/\/+$/, "");

const TOKEN_STORAGE_KEY = "cloudguard.session.token";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request couldn't be completed. Please check your details and try again.",
  401: "Email or password is incorrect.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "An account with this email already exists. Please sign in instead.",
  422: "Please check the information you entered and try again.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on the server. Please try again.",
  503: "The service is temporarily unavailable. Please try again shortly.",
};

const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

type SessionExpiredListener = () => void;

const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export function getToken(): string | null {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode, etc.) — session won't survive reload.
  }
}

function extractBackendMessage(body: unknown): string | null {
  if (body && typeof body === "object") {
    const detail = (body as Record<string, unknown>)["detail"];
    if (typeof detail === "string" && detail.length > 0) return detail;
    const message = (body as Record<string, unknown>)["message"];
    if (typeof message === "string" && message.length > 0) return message;
  }
  return null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined;
  body?: unknown;
  formData?: FormData | undefined;
  query?: Record<string, string | number | undefined> | undefined;
  signal?: AbortSignal | undefined;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query, signal } = options;

  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8080";
  const url = new URL(`${BASE_URL}${path}`, origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const init: RequestInit = { method, headers };
  if (formData !== undefined) init.body = formData;
  else if (body !== undefined) init.body = JSON.stringify(body);
  if (signal !== undefined) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(url.toString(), init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "CloudGuard is temporarily unable to reach the server. Please try again.");
  }

  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      // Non-JSON error body — fall through to the status mapping.
    }

    if (response.status === 401 && token) {
      setToken(null);
      sessionExpiredListeners.forEach((listener) => listener());
      throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
    }

    throw new ApiError(
      response.status,
      extractBackendMessage(parsed) ?? STATUS_MESSAGES[response.status] ?? "Something went wrong. Please try again.",
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body" | "formData">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body" | "formData">) =>
    request<T>(path, { ...options, method: "POST", body }),
  postForm: <T>(path: string, formData: FormData, options?: Omit<RequestOptions, "method" | "body" | "formData">) =>
    request<T>(path, { ...options, method: "POST", formData }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body" | "formData">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body" | "formData">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export function buildFileFormData(file: Blob | File, fieldName: string, fileName?: string | undefined): FormData {
  const formData = new FormData();
  formData.append(fieldName, file, fileName ?? (file instanceof File ? file.name : "upload"));
  return formData;
}
