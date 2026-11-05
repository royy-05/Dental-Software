/**
 * Helpers for calling route handlers directly in integration tests.
 * Test files must mock Auth.js first:
 *   vi.mock("@/auth", () => import("@/test/mock-auth"));
 */
import { NextRequest } from "next/server";
import { prisma, withPlatform } from "@/server/db";

/** Parsed JSON body; tests index into it freely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiJson = any;

type Route = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

export function setTestSession(sid: string | null) {
  (globalThis as { __testSid?: string | null }).__testSid = sid;
}

export async function sessionFor(email: string, extra: { impersonationClinic?: string; reason?: string } = {}): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const s = await withPlatform((tx) =>
    tx.authSession.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600_000),
        impersonationClinic: extra.impersonationClinic ?? null,
        impersonationReason: extra.reason ?? null,
        impersonationAt: extra.impersonationClinic ? new Date() : null,
      },
    }),
  );
  return s.id;
}

export async function as(email: string | null) {
  setTestSession(email ? await sessionFor(email) : null);
}

export async function call(
  route: Route,
  opts: { method?: string; path?: string; params?: Record<string, string>; body?: unknown; query?: Record<string, string>; ip?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; json: ApiJson }> {
  const url = new URL(opts.path ?? "/api/test", "http://localhost:3000");
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const req = new NextRequest(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "198.51.100.77", ...(opts.headers ?? {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const res = await route(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

export const EMAILS = {
  super: "jordan@kivihealth.example.com",
  support: "kim@kivihealth.example.com",
  owner: "olivia@brightsmile.example.com",
  manager: "marcus@brightsmile.example.com",
  frontDesk: "fiona@brightsmile.example.com",
  physioFrontDesk: "theo@motionphysio.example.com",
  dermManager: "isla@clearskin.example.com",
};
