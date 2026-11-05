import type { Job } from "pg-boss";
import { newBoss, QUEUES } from "./queue";
import { deliverMessage, hourlyTick } from "./deliver";
import { log } from "../log";
import { prisma } from "../db";

/**
 * Background worker: `npm run worker`. Delivers queued email/SMS (send-message jobs) and runs the hourly tick
 * (daily summaries, expired holds, delivery-log sweep). Several workers can run at once.
 */
async function main() {
  const boss = newBoss({ connectionString: process.env.DATABASE_URL!, migrate: false, supervise: false });
  boss.on("error", (e: Error) => log.error("pg-boss error", { error: e.message }));
  await boss.start();
  await boss.work<{ messageId: string }>(QUEUES.sendMessage, { batchSize: 5, pollingIntervalSeconds: 2 }, async (jobs: Job<{ messageId: string }>[]) => {
    for (const job of jobs) {
      const outcome = await deliverMessage(job.data.messageId);
      log.info("Message job", { messageId: job.data.messageId, outcome });
      if (outcome === "failed") throw new Error(`Delivery failed for ${job.data.messageId}`);
    }
  });
  await boss.work(QUEUES.hourlyTick, { pollingIntervalSeconds: 30 }, async () => {
    const r = await hourlyTick();
    log.info("Hourly tick", r as unknown as Record<string, unknown>);
  });
  // Sweep on start and every minute so nothing waits on a lost job.
  const sweep = setInterval(() => hourlyTick().catch((e) => log.error("Tick failed", { error: String(e) })), 60_000);
  await hourlyTick();
  log.info("Worker started", { queues: Object.values(QUEUES) });
  const stop = async () => {
    clearInterval(sweep);
    await boss.stop({ graceful: true, timeout: 10_000 });
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
