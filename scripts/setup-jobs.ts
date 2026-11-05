import { newBoss, QUEUES } from "../src/server/jobs/queue";
import { createPrismaClient } from "../src/server/db";

/**
 * One-time queue setup, run with the owner connection (DIRECT_DATABASE_URL): creates the pgboss schema and queues
 * and grants the runtime role access. Part of `npm run db:setup`; safe to re-run.
 */
async function main() {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_DATABASE_URL is not set");
  const boss = newBoss({ connectionString: url, migrate: true, supervise: false });
  await boss.start();
  await boss.createQueue(QUEUES.sendMessage, { retryLimit: 3, retryBackoff: true, retentionSeconds: 7 * 86400 });
  await boss.createQueue(QUEUES.hourlyTick, { retryLimit: 0, retentionSeconds: 86400 });
  await boss.schedule(QUEUES.hourlyTick, "5 * * * *", {}, { tz: "UTC" });
  await boss.stop({ graceful: false });
  const prisma = createPrismaClient(url);
  await prisma.$executeRawUnsafe("GRANT USAGE ON SCHEMA pgboss TO kivi_app");
  await prisma.$executeRawUnsafe("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO kivi_app");
  await prisma.$executeRawUnsafe("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO kivi_app");
  await prisma.$executeRawUnsafe("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO kivi_app");
  await prisma.$executeRawUnsafe("ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kivi_app");
  await prisma.$disconnect();
  console.log("Job queue ready (schema pgboss, queues: send-message, hourly-tick)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
