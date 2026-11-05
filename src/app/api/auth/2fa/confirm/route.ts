import { z } from "zod";
import { handler } from "@/server/http";
import { confirmTotpSetup } from "@/server/auth/accounts";

export const POST = handler(
  { summary: "Confirm TOTP enrolment with a current code", access: { kind: "user", allowDuringTwoFactorSetup: true }, body: z.object({ code: z.string().regex(/^\d{6}$/) }) },
  async ({ auth, body, actor }) => {
    await confirmTotpSetup(auth.userId, body.code, actor);
    return { ok: true };
  },
);
