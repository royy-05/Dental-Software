import { z } from "zod";
import { handler } from "@/server/http";
import { disableTotp } from "@/server/auth/accounts";

export const POST = handler(
  { summary: "Turn off own 2FA (password + code; refused when 2FA is enforced)", access: { kind: "user" }, body: z.object({ password: z.string().min(1).max(256), code: z.string().regex(/^\d{6}$/) }) },
  async ({ auth, body, actor }) => {
    await disableTotp(auth.userId, body.password, body.code, actor);
    return { ok: true };
  },
);
