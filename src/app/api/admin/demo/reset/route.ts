import { handler } from "@/server/http";
import { notFound } from "@/server/errors";
import { isDemoMode } from "@/server/env";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { seedDatabase } from "@/server/seed";

/** Re-seeds the demo data (DEMO_MODE only). Sessions survive because users keep their ids. */
export const POST = handler({ summary: "DEMO_MODE only: wipe and re-seed the demo data", access: { kind: "platform", permission: "admin:seed" } }, async ({ actor }) => {
  if (!isDemoMode()) throw notFound();
  const r = await seedDatabase();
  await withPlatform((tx) => audit(tx, actor, { action: "Reset demo data", category: "settings", target: "Platform" }));
  return r;
});
