import { handler } from "@/server/http";
import { withTenant } from "@/server/db";
import { effectiveTemplates } from "@/server/services/notify";

export const GET = handler({ summary: "Message templates for every event and channel (clinic copies, global defaults where none)", access: { kind: "clinic", permission: "templates:manage" } }, async ({ clinicId }) =>
  withTenant(clinicId, (tx) => effectiveTemplates(tx, clinicId)),
);
