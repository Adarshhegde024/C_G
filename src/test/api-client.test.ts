import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiClient, onSessionExpired, setToken } from "@/api/client";
import { homeForRole, roleGuard } from "@/auth/roles";

describe("API client error handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it("maps 409 to the duplicate-account message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 409 })));
    await expect(apiClient.post("/api/auth/register", {})).rejects.toMatchObject({
      status: 409,
      message: "An account with this email already exists. Please sign in instead.",
    });
  });

  it("maps 401 to the credentials message when no session token exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 401 })));
    await expect(apiClient.post("/api/auth/login", {})).rejects.toMatchObject({
      status: 401,
      message: "Email or password is incorrect.",
    });
  });

  it("clears the session and reports expiry on an authenticated 401", async () => {
    setToken("test-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 401 })));
    const expired = vi.fn();
    onSessionExpired(expired);
    await expect(apiClient.get("/api/dashboard")).rejects.toMatchObject({
      status: 401,
      message: "Your session has expired. Please sign in again.",
    });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("cloudguard.session.token")).toBeNull();
  });

  it("uses the backend-provided message when it is a friendly string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invitation expired." }), { status: 400 })),
    );
    await expect(apiClient.post("/api/invite/abc/accept", {})).rejects.toMatchObject({ message: "Invitation expired." });
  });

  it("reports an unreachable server without technical details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiClient.get("/api/dashboard")).rejects.toMatchObject({
      status: 0,
      message: "CloudGuard is temporarily unable to reach the server. Please try again.",
    });
  });

  it("never leaks raw stack traces in ApiError messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Internal Server Error text", { status: 500 })));
    const error = (await apiClient
      .get("/api/dashboard")
      .then(() => null)
      .catch((err) => err)) as ApiError | null;
    expect(error).toBeInstanceOf(ApiError);
    expect(error?.message).toBe("Something went wrong on the server. Please try again.");
    expect(error?.message).not.toContain("Internal");
  });
});

describe("Role routing", () => {
  it("sends each role to its own home dashboard", () => {
    expect(homeForRole("owner")).toBe("/dashboard");
    expect(homeForRole("recipient")).toBe("/recipient/dashboard");
    expect(homeForRole("nominee")).toBe("/nominee/dashboard");
    expect(homeForRole("reviewer")).toBe("/reviewer/dashboard");
  });

  it("blocks a role from another role's area by redirecting to its own home", () => {
    expect(roleGuard({ role: "recipient" }, ["reviewer"])).toBe("/recipient/dashboard");
    expect(roleGuard({ role: "owner" }, ["owner"])).toBeNull();
  });
});
