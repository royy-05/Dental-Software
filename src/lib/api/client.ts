"use client";

/** Typed fetch wrapper for the /api routes. Errors carry the server's { code, message, details }. */
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Background polls do not count as user activity for the idle timeout. */
  background?: boolean;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.background ? { "x-kivi-background": "1" } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    signal: opts.signal,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    const e = new ApiClientError(res.status, err?.code ?? "http_error", err?.message ?? `Request failed (${res.status})`, err?.details);
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.assign(`/login?reason=${e.code === "session_expired" ? "expired" : "signin"}&next=${next}`);
    }
    if (res.status === 403 && e.code === "two_factor_setup_required" && typeof window !== "undefined" && !window.location.pathname.startsWith("/account")) {
      window.location.assign("/account/security?setup=1");
    }
    throw e;
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");
