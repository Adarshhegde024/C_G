import { apiClient, setToken } from "./client";
import type { AuthUser, DurationValue, RegisterPayload } from "@/types";

interface AuthResponse {
  token?: string;
  access_token?: string;
  user?: AuthUser;
}

function normalizeAuth(response: AuthResponse): { token: string; user: AuthUser } {
  const token = response.token ?? response.access_token;
  const user = response.user;
  if (!token || !user) {
    throw Object.assign(new Error("The server returned an unexpected authentication response."), { name: "ApiError" });
  }
  return { token, user };
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await apiClient.post<AuthResponse>("/api/auth/login", { email, password });
  const { token, user } = normalizeAuth(response);
  setToken(token);
  return user;
}

/**
 * Registration never signs the user in. The backend creates the account and
 * the user is sent to /login to sign in normally.
 */
export async function register(payload: RegisterPayload): Promise<void> {
  await apiClient.post<{ ok?: boolean }>("/api/auth/register", {
    full_name: payload.full_name,
    email: payload.email,
    phone: payload.phone,
    date_of_birth: payload.date_of_birth,
    password: payload.password,
    check_in_frequency: payload.check_in_frequency,
    grace_period: payload.grace_period,
    face_samples: payload.face_samples,
  });
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/api/auth/logout");
  } finally {
    setToken(null);
  }
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const user = await apiClient.get<AuthUser>("/api/auth/me");
  return user;
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await apiClient.post("/api/auth/forgot-password", { email });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiClient.post("/api/auth/reset-password", { token, password });
}

// ---- Google OAuth -----------------------------------------------------------
// The real Google OAuth flow is started by redirecting the browser to Google's
// authorization endpoint. The backend exchanges the returned authorization
// code for tokens; the frontend never holds a client secret.

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").toString();

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super("Google sign-in isn't configured for this environment yet.");
    this.name = "GoogleNotConfiguredError";
  }
}

export function isGoogleConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

export function startGoogleSignIn(): void {
  if (!isGoogleConfigured()) throw new GoogleNotConfiguredError();

  const redirectUri = `${window.location.origin}/auth/google/callback`;
  const state = crypto.randomUUID();
  sessionStorage.setItem("cloudguard.oauth.state", state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function completeGoogleSignIn(code: string, state: string | null): Promise<AuthUser> {
  const savedState = sessionStorage.getItem("cloudguard.oauth.state");
  if (savedState && state && savedState !== state) {
    throw Object.assign(new Error("The sign-in attempt could not be verified. Please try again."), { name: "ApiError" });
  }
  sessionStorage.removeItem("cloudguard.oauth.state");

  const response = await apiClient.post<AuthResponse>("/api/auth/google", { code });
  const { token, user } = normalizeAuth(response);
  setToken(token);
  return user;
}
