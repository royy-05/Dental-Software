import { z } from "zod";
import { handler } from "@/server/http";
import { resetPassword } from "@/server/auth/accounts";

export const POST = handler(
  {
    summary: "Set a new password with a one-time reset token; revokes all sessions",
    access: { kind: "public", rateLimit: "passwordResetPerIp" },
    body: z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(256) }),
  },
  async ({ body, ip }) => {
    await resetPassword({ ...body, ip });
    return { ok: true };
  },
);
