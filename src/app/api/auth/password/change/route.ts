import { z } from "zod";
import { handler } from "@/server/http";
import { changePassword } from "@/server/auth/accounts";

export const POST = handler(
  { summary: "Change own password (needs current password)", access: { kind: "user" }, body: z.object({ current: z.string().min(1).max(256), next: z.string().min(1).max(256) }) },
  async ({ body, auth, actor }) => {
    await changePassword(auth.userId, body.current, body.next, actor);
    return { ok: true };
  },
);
