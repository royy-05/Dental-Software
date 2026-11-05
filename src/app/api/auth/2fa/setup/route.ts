import { handler } from "@/server/http";
import { startTotpSetup } from "@/server/auth/accounts";

export const POST = handler({ summary: "Start TOTP enrolment: returns a new secret and otpauth URL", access: { kind: "user", allowDuringTwoFactorSetup: true } }, async ({ auth }) =>
  startTotpSetup(auth.userId),
);
