import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Database access. Every query runs inside one of three scopes, each a transaction that sets
 * transaction-local Postgres settings read by the row-level security policies
 * (prisma/migrations/*_rls/migration.sql):
 *
 * - withTenant(clinicId, fn): only that clinic's rows are visible or writable.
 * - withPlatform(fn): super admin panel and background jobs; all rows.
 * - no scope: every clinic-owned table returns zero rows (fail closed).
 *
 * The runtime connection (DATABASE_URL) uses the kivi_app role, which cannot bypass RLS.
 */
export type Tx = Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as { __kiviPrisma?: PrismaClient };

export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    ...(url ? { datasourceUrl: url } : {}),
    log: process.env.PRISMA_LOG === "1" ? ["query", "warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.__kiviPrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__kiviPrisma = prisma;

export interface ScopeOptions {
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  client?: PrismaClient;
}

async function scoped<T>(scope: "tenant" | "platform", clinicId: string | null, fn: (tx: Tx) => Promise<T>, opts: ScopeOptions = {}): Promise<T> {
  const client = opts.client ?? prisma;
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.scope', ${scope}, true), set_config('app.clinic_id', ${clinicId ?? ""}, true)`;
      return fn(tx);
    },
    { timeout: opts.timeoutMs ?? 15_000, maxWait: 10_000, isolationLevel: opts.isolationLevel },
  );
}

/** Run `fn` with row-level security scoped to one clinic. */
export function withTenant<T>(clinicId: string, fn: (tx: Tx) => Promise<T>, opts?: ScopeOptions): Promise<T> {
  if (!clinicId) throw new Error("withTenant requires a clinic id");
  return scoped("tenant", clinicId, fn, opts);
}

/** Run `fn` with platform scope (all clinics). Only for super admin routes, auth and background jobs. */
export function withPlatform<T>(fn: (tx: Tx) => Promise<T>, opts?: ScopeOptions): Promise<T> {
  return scoped("platform", null, fn, opts);
}

/** Resolve a public booking slug to a clinic id without any scope (SECURITY DEFINER function). */
export async function clinicIdForSlug(slug: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string | null }[]>`SELECT clinic_id_for_slug(${slug}) AS id`;
  return rows[0]?.id ?? null;
}
