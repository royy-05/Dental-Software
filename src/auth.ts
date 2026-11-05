import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { attemptLogin, revokeSession } from "@/server/auth/login";
import { clientIp, userAgent } from "@/server/request";

class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  code: z.string().max(10).optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, code: {} },
      async authorize(raw, request) {
        const parsed = credentials.safeParse({ ...raw, code: raw?.code || undefined });
        if (!parsed.success) throw new LoginError("invalid");
        const headers = request instanceof Request ? request.headers : new Headers();
        const result = await attemptLogin({ ...parsed.data, ip: clientIp(headers), userAgent: userAgent(headers) });
        if (!result.ok) throw new LoginError(result.code);
        return { id: result.userId, sid: result.sessionId } as { id: string; sid: string };
      },
    }),
  ],
  events: {
    async signOut(message) {
      const sid = "token" in message ? (message.token?.sid as string | undefined) : undefined;
      if (sid) await revokeSession(sid);
    },
  },
});
