import { defineConfig } from "vitest/config";
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

// Integration tests (*.int.test.ts) run against TEST_DATABASE_URL, migrated and seeded once by the global setup.
const testDb = process.env.TEST_DATABASE_URL;
const testDirect = process.env.TEST_DIRECT_DATABASE_URL;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["./src/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      ...(testDb ? { DATABASE_URL: testDb } : {}),
      ...(testDirect ? { DIRECT_DATABASE_URL: testDirect } : {}),
      EMAIL_DRIVER: "memory",
      SMS_DRIVER: "mock",
      APP_BASE_URL: "http://localhost:3000",
    },
  },
});
