import { PgBoss } from "pg-boss";
import { log } from "../log";
import type { QueuedJob } from "../services/notify";

/**
 * pg-boss job queue (section 7). Queues:
 *   send-message   { messageId }            deliver one delivery-log row (now or at startAfter)
 *   hourly-tick    {}                         cron: daily clinic summaries, expired holds, delivery-log sweep
 * The web app only sends jobs; `npm run worker` (src/server/jobs/worker.ts) processes them. The pgboss schema is
 * created once by `npm run db:setup` (scripts/setup-jobs.ts) with the owner connection; the runtime role never migrates.
 */
export const QUEUES = { sendMessage: "send-message", hourlyTick: "hourly-tick" } as const;

let boss: PgBoss | null = null;
let starting: Promise<PgBoss | null> | null = null;

export function newBoss(opts: { connectionString: string; migrate: boolean; supervise?: boolean }): PgBoss {
  return new PgBoss({
    connectionString: opts.connectionString,
    schema: "pgboss",
    migrate: opts.migrate,
    supervise: opts.supervise ?? opts.migrate,
    max: 3,
  });
}

/** Shared client for sending jobs from request handlers. Null when the queue schema does not exist yet. */
export async function getBoss(): Promise<PgBoss | null> {
  if (boss) return boss;
  if (!starting) {
    starting = (async () => {
      try {
        const b = newBoss({ connectionString: process.env.DATABASE_URL!, migrate: false, supervise: false });
        b.on("error", (e: Error) => log.error("pg-boss error", { error: e.message }));
        await b.start();
        boss = b;
        return b;
      } catch (e) {
        log.warn("Job queue unavailable; the worker sweep will deliver queued messages", { error: e instanceof Error ? e.message : String(e) });
        starting = null;
        return null;
      }
    })();
  }
  return starting;
}

/** Called after the transaction that created the delivery-log rows has committed. Failures are tolerated: the worker sweeps. */
export async function enqueueMessages(jobs: QueuedJob[]): Promise<void> {
  if (!jobs.length) return;
  const b = await getBoss();
  if (!b) return;
  for (const j of jobs) {
    try {
      await b.send(QUEUES.sendMessage, { messageId: j.messageId }, { singletonKey: j.messageId, retryLimit: 3, retryBackoff: true, startAfter: j.startAfter, expireInSeconds: 120 });
    } catch (e) {
      log.warn("Could not enqueue message job", { messageId: j.messageId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

export async function stopBoss() {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 5000 });
    boss = null;
    starting = null;
  }
}
