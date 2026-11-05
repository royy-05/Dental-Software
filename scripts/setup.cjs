#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync, spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");

console.log("\n=======================================================");
console.log("🦷 Kivi Health Booking Platform — Setup");
console.log("=======================================================\n");

// 1. Check & create .env
if (fs.existsSync(envPath)) {
  console.log("✓ Existing .env file found (preserving existing configuration).");
} else {
  if (!fs.existsSync(envExamplePath)) {
    console.error("❌ Error: .env.example not found.");
    process.exit(1);
  }

  console.log("Creating .env from .env.example with secure random secrets...");
  let envContent = fs.readFileSync(envExamplePath, "utf8");

  const randBase64 = () => crypto.randomBytes(32).toString("base64");

  const authSecret = randBase64();
  const encryptionKey = randBase64();
  const linkSecret = randBase64();
  const smsSecret = randBase64();

  envContent = envContent.replace(/^AUTH_SECRET=".*"|^AUTH_SECRET=/m, `AUTH_SECRET="${authSecret}"`);
  envContent = envContent.replace(/^APP_ENCRYPTION_KEY=".*"|^APP_ENCRYPTION_KEY=/m, `APP_ENCRYPTION_KEY="${encryptionKey}"`);
  envContent = envContent.replace(/^LINK_SIGNING_SECRET=".*"|^LINK_SIGNING_SECRET=/m, `LINK_SIGNING_SECRET="${linkSecret}"`);
  envContent = envContent.replace(/^SMS_WEBHOOK_SECRET=".*"|^SMS_WEBHOOK_SECRET=/m, `SMS_WEBHOOK_SECRET="${smsSecret}"`);

  fs.writeFileSync(envPath, envContent, "utf8");
  console.log("✓ Generated .env with cryptographic secrets.");
}

// 2. Start Docker Postgres
console.log("\nStarting Docker PostgreSQL container...");
try {
  execSync("docker compose up -d", { stdio: "inherit", cwd: rootDir });
  console.log("✓ Docker container started.");
} catch (err) {
  console.error("\n❌ Failed to start Docker container.");
  console.error("Please ensure Docker Desktop is running and try again.");
  console.error("Troubleshooting: see README.md for Docker setup guidance.");
  process.exit(1);
}

// Helper to run npm/npx cross-platform
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

// 3. Wait for PostgreSQL to become ready
console.log("\nWaiting for database to be ready...");
let dbReady = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = spawnSync("docker", ["compose", "exec", "-T", "db", "pg_isready", "-U", "kivi", "-d", "kivi"], {
      cwd: rootDir,
      encoding: "utf8",
    });
    if (res.status === 0) {
      dbReady = true;
      break;
    }
  } catch {}
  execSync(process.platform === "win32" ? "ping 127.0.0.1 -n 2 > nul" : "sleep 1", { shell: true });
}

if (!dbReady) {
  console.warn("⚠️ Warning: Database health check did not respond within 30s. Continuing setup...");
} else {
  console.log("✓ Database is accepting connections.");
}

// 4. Run Prisma generate
console.log("\nGenerating Prisma client...");
try {
  execSync(`${npxCmd} prisma generate`, { stdio: "inherit", cwd: rootDir });
  console.log("✓ Prisma client generated.");
} catch (err) {
  console.error("❌ Failed to generate Prisma client.");
  process.exit(1);
}

// 5. Run db:setup (migrate, jobs queue, seed)
console.log("\nRunning database migrations, queue setup, and demo seed...");
try {
  execSync(`${npmCmd} run db:setup`, { stdio: "inherit", cwd: rootDir });
  console.log("✓ Database setup completed successfully.");
} catch (err) {
  console.error("❌ Failed to set up database.");
  console.error("Troubleshooting: Check if host port matches between .env and docker-compose.yml.");
  process.exit(1);
}

// 6. Print next steps
console.log("\n=======================================================");
console.log("🎉 Setup complete! You're ready to run Kivi Health.");
console.log("=======================================================");
console.log("\nNext steps to start the application:\n");
console.log("  1. In your first terminal (Next.js web app):");
console.log("     npm run dev");
console.log("     Open: http://localhost:3000\n");
console.log("  2. In a second terminal (pg-boss background worker):");
console.log("     npm run worker\n");
console.log("  3. Demo credentials (when DEMO_MODE=true):");
console.log("     Password for all seeded accounts: Demo-Passw0rd-2026");
console.log("     Try signing in as Super Admin, Support Agent, Clinic Owner,");
console.log("     Clinic Manager, or Front Desk at http://localhost:3000/login\n");
console.log("=======================================================\n");
