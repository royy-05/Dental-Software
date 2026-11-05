// Cross-platform runner for unit tests (skips database setup)
process.env.SKIP_DB_SETUP = "1";
const { spawnSync } = require("child_process");
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(cmd, ["vitest", "run", "--exclude", "src/**/*.int.test.ts", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 0);
