/**
 * Generates docs/api.md from the route specs attached by `handler()` (src/server/http.ts).
 * Run: npm run docs:api
 */
import { readdirSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { pathToFileURL } from "url";
import type { ZodType } from "zod";

process.env.DATABASE_URL ??= "postgresql://x:y@localhost:5432/z";

const ROOT = join(process.cwd(), "src/app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f === "route.ts") out.push(p);
  }
  return out;
}

function describeAccess(a: { kind: string; permission?: string; feature?: string; rateLimit?: string; allowDuringTwoFactorSetup?: boolean }) {
  if (a.kind === "public") return `Public${a.rateLimit ? ` (rate limit: ${a.rateLimit})` : ""}`;
  if (a.kind === "user") return `Signed in${a.allowDuringTwoFactorSetup ? " (allowed before 2FA setup)" : ""}`;
  if (a.kind === "clinic") return `Clinic role with \`${a.permission}\`${a.feature ? ` and feature \`${a.feature}\`` : ""}`;
  return `Platform role with \`${a.permission}\``;
}

function shape(schema: ZodType | undefined): string {
  if (!schema) return "";
  const def = (schema as unknown as { _zod?: { def?: { shape?: Record<string, unknown>; type?: string } }; def?: { shape?: Record<string, unknown>; type?: string } });
  const d = def._zod?.def ?? def.def;
  const s = d?.shape;
  if (s && typeof s === "object") return Object.keys(s).join(", ");
  return d?.type ?? "";
}

async function main() {
  const files = walk(ROOT).sort();
  const lines: string[] = [
    "# API reference",
    "",
    "Generated from the route specs by `npm run docs:api`. Every route runs **authenticate → authorize (role matrix, feature flags) → validate (zod) → act**; see `src/server/http.ts`.",
    "",
    "Errors are `{ error: { code, message, details? } }` with HTTP status 400 (validation_error, bad_request), 401 (unauthorized, session_expired), 403 (forbidden, two_factor_setup_required, clinic_unavailable, not_accepting), 404, 409 (conflict, slot_taken, outside_window, not_active), 410 (link_invalid, link_stale), 429 (rate_limited, with Retry-After).",
    "",
    "Times on appointments are clinic wall-clock strings (`YYYY-MM-DDTHH:mm`); `createdAt`, `at` and log timestamps are UTC instants.",
    "",
    "| Method | Path | Access | Params / query / body | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];
  let count = 0;
  for (const file of files) {
    const mod = await import(pathToFileURL(file).href);
    const path = "/" + relative(ROOT, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "").replace(/\[\.\.\.(\w+)\]/g, ":$1*").replace(/\[(\w+)\]/g, ":$1");
    for (const m of METHODS) {
      const fn = mod[m] as { spec?: { summary: string; access: Parameters<typeof describeAccess>[0]; params?: ZodType; query?: ZodType; body?: ZodType } } | undefined;
      if (!fn) continue;
      count++;
      const spec = fn.spec;
      if (!spec) {
        lines.push(`| ${m} | \`/api${path}\` | Auth.js | | Auth.js credentials sign-in, sign-out and session endpoints |`);
        continue;
      }
      const inputs = [spec.params && `params: ${shape(spec.params)}`, spec.query && `query: ${shape(spec.query)}`, spec.body && `body: ${shape(spec.body)}`].filter(Boolean).join("; ");
      lines.push(`| ${m} | \`/api${path}\` | ${describeAccess(spec.access)} | ${inputs} | ${spec.summary} |`);
    }
  }
  lines.push("", `${count} endpoints.`, "");
  writeFileSync(join(process.cwd(), "docs/api.md"), lines.join("\n"));
  console.log(`docs/api.md: ${count} endpoints`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
