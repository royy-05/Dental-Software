import { execSync } from "child_process";

/**
 * Migrates and seeds the test database once per run. Skipped (with a warning) when only unit tests run:
 * `npm run test:unit` sets SKIP_DB_SETUP=1.
 */
export default async function setup() {
  if (process.env.SKIP_DB_SETUP === "1") return;
  const direct = process.env.TEST_DIRECT_DATABASE_URL;
  if (!direct || !process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL and TEST_DIRECT_DATABASE_URL must be set for integration tests (see .env.example). Use `npm run test:unit` for unit tests only.");
  }
  const env = { ...process.env, DATABASE_URL: direct, DIRECT_DATABASE_URL: direct };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
