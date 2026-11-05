import { handler } from "@/server/http";
import { withPlatform } from "@/server/db";
import { audit } from "@/server/audit";
import { json } from "@/server/mappers";
import { platformSettings } from "@/server/services/notify";
import { zPlatformSettings } from "@/lib/schemas";

export const GET = handler({ summary: "Platform settings: branding/white-label, retention, backups, maintenance mode, messaging providers, analytics defaults", access: { kind: "platform", permission: "admin:access" } }, async () => withPlatform(platformSettings));

export const PATCH = handler({ summary: "Update platform settings (any top-level section)", access: { kind: "platform", permission: "admin:system:edit" }, body: zPlatformSettings.partial() }, async ({ body, actor }) =>
  withPlatform(async (tx) => {
    const current = await platformSettings(tx);
    const next = { ...current, ...body };
    await tx.platformSetting.upsert({ where: { id: "platform" }, create: { id: "platform", value: json(next) }, update: { value: json(next) } });
    await audit(tx, actor, { action: `Updated platform ${Object.keys(body).join(", ")}`, category: "settings", target: "Platform" });
    return next;
  }),
);
