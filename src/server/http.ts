import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { Prisma } from "@prisma/client";
import type { FeatureKey, Role } from "@/types";
import { can, type Permission } from "@/lib/permissions";
import { auth } from "@/auth";
import { ApiError, badRequest, forbidden, notFound, unauthorized } from "./errors";
import { actorOf, clinicRole, loadSession, type AuthContext } from "./auth/context";
import { clientIp } from "./request";
import { enforce, LIMITS } from "./rate-limit";
import { withPlatform } from "./db";
import { log } from "./log";
import type { Actor } from "./audit";
import { featureEnabledForClinic } from "./features";

/**
 * Every API route is built with `handler()`, which always runs, in order:
 *   1. authenticate  - Auth.js JWT -> server-side session (revoked / idle timeout / inactive user rejected)
 *   2. authorize     - role permission (src/lib/permissions.ts) for the clinic in the URL or the platform,
 *                      plus plan feature flags
 *   3. validate      - zod schemas for params, query and JSON body
 *   4. act           - the route function
 * The `spec` is attached to the returned function so docs/api.md is generated from the code (npm run docs:api).
 */
export type Access =
  | { kind: "public"; rateLimit?: keyof typeof LIMITS }
  | { kind: "user"; allowDuringTwoFactorSetup?: boolean }
  | { kind: "clinic"; permission: Permission; feature?: FeatureKey }
  | { kind: "platform"; permission: Permission };

export interface RouteSpec<P extends ZodType, Q extends ZodType, B extends ZodType> {
  access: Access;
  params?: P;
  query?: Q;
  body?: B;
  /** One line for docs/api.md */
  summary: string;
}

export interface HandlerCtx<P, Q, B> {
  req: NextRequest;
  ip: string;
  params: P;
  query: Q;
  body: B;
  /** null only for public routes */
  auth: AuthContext;
  actor: Actor;
  /** Effective role for clinic routes (membership, super admin, or impersonation role) */
  role: Role | null;
  /** Clinic id from the URL for clinic routes */
  clinicId: string;
}

type RouteFn = ((req: NextRequest, ctx: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>) & {
  spec: RouteSpec<ZodType, ZodType, ZodType>;
};

const clinicParams = z.object({ clinicId: z.string().min(1).max(64) });

export function handler<P extends ZodType = ZodType<Record<string, string>>, Q extends ZodType = ZodType<Record<string, string>>, B extends ZodType = ZodType<unknown>>(
  spec: RouteSpec<P, Q, B>,
  fn: (c: HandlerCtx<z.infer<P>, z.infer<Q>, z.infer<B>>) => Promise<unknown>,
): RouteFn {
  const route = async (req: NextRequest, routeCtx: { params: Promise<Record<string, string | string[]>> }) => {
    const ip = clientIp(req.headers);
    try {
      const rawParams = (await routeCtx.params) ?? {};
      const access = spec.access;

      // 1. authenticate
      let authCtx: AuthContext | null = null;
      if (access.kind !== "public") {
        const session = await auth();
        const sid = (session as unknown as { sid?: string } | null)?.sid;
        if (!sid) throw unauthorized();
        authCtx = await loadSession(sid, { ip, touch: req.headers.get("x-kivi-background") !== "1" });
        if (!authCtx) throw unauthorized("Your session has ended. Please sign in again.", "session_expired");
        if (authCtx.needsTwoFactorSetup && !(access.kind === "user" && access.allowDuringTwoFactorSetup)) {
          throw new ApiError(403, "two_factor_setup_required", "Set up two-factor authentication to continue.");
        }
        await enforce(`api:user:${authCtx.userId}`, LIMITS.apiPerUser.limit, LIMITS.apiPerUser.windowSec);
      } else if (access.rateLimit) {
        const l = LIMITS[access.rateLimit];
        await enforce(`${access.rateLimit}:${ip}`, l.limit, l.windowSec);
      }

      // 2. authorize
      let role: Role | null = null;
      let clinicId = "";
      if (access.kind === "clinic") {
        const p = clinicParams.safeParse(rawParams);
        if (!p.success) throw badRequest("Missing clinic id");
        clinicId = p.data.clinicId;
        role = clinicRole(authCtx!, clinicId);
        if (!role) throw forbidden("You do not have access to this clinic.");
        if (!can(role, access.permission)) throw forbidden();
        const clinic = await withPlatform((tx) => tx.clinic.findUnique({ where: { id: clinicId }, select: { deletedAt: true } }));
        if (!clinic || (clinic.deletedAt && !authCtx!.platformRole)) throw notFound("Clinic");
        if (access.feature && !(await featureEnabledForClinic(clinicId, access.feature))) throw forbidden("This module is not enabled for this clinic.");
      } else if (access.kind === "platform") {
        if (!authCtx!.platformRole || !can(authCtx!.platformRole, access.permission)) throw forbidden();
        role = authCtx!.platformRole;
      }

      // 3. validate
      const params = spec.params ? spec.params.parse(rawParams) : rawParams;
      const query = spec.query ? spec.query.parse(Object.fromEntries(req.nextUrl.searchParams)) : Object.fromEntries(req.nextUrl.searchParams);
      let body: unknown = undefined;
      if (spec.body) {
        let json: unknown;
        try {
          json = await req.json();
        } catch {
          throw badRequest("Request body must be JSON.");
        }
        body = spec.body.parse(json);
      }

      // 4. act
      const actor: Actor = authCtx ? actorOf(authCtx) : { id: "patient", name: "Patient (booking widget)", role: "patient", ip };
      if (authCtx && role && access.kind === "clinic" && !authCtx.impersonation) actor.role = role;
      const result = await fn({ req, ip, params, query, body, auth: authCtx as AuthContext, actor, role, clinicId } as HandlerCtx<z.infer<P>, z.infer<Q>, z.infer<B>>);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
  return Object.assign(route, { spec: spec as unknown as RouteSpec<ZodType, ZodType, ZodType> });
}

export function errorResponse(err: unknown, req?: NextRequest): Response {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (err.status === 429 && (err.details as { retryAfter?: number })?.retryAfter) headers["Retry-After"] = String((err.details as { retryAfter: number }).retryAfter);
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status, headers });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: { code: "validation_error", message: "Some fields are invalid.", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 400 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
    if (err.code === "P2002") return NextResponse.json({ error: { code: "conflict", message: "That already exists." } }, { status: 409 });
  }
  log.error("Unhandled API error", { path: req?.nextUrl.pathname, error: err instanceof Error ? err.message : String(err) });
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
}

/** Shared zod pieces */
export const zId = z.string().min(1).max(64);
export const idParams = (key: string) => z.object({ clinicId: zId, [key]: zId });
