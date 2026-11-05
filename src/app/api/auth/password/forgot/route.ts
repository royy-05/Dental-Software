import { z } from "zod";
import { handler } from "@/server/http";
import { requestPasswordReset } from "@/server/auth/accounts";

export const POST = handler(
  { summary: "Email a password reset link (always 200; no account enumeration)", access: { kind: "public" }, body: z.object({ email: z.string().email().max(254) }) },
  async ({ body, ip }) => {
    await requestPasswordReset(body.email, ip);
    return { ok: true };
  },
);
