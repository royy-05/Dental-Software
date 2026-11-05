import type { NextAuthConfig } from "next-auth";
import { SESSION_MAX_AGE_SEC } from "@/server/auth/session-constants";

/**
 * Edge-safe Auth.js config (no providers, no database). Used by middleware to check that a session cookie
 * exists for panel pages. The full session check (revocation, idle timeout) runs in every API route.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SEC },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sid = (user as { sid?: string }).sid;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      (session as unknown as { sid?: string }).sid = token.sid as string | undefined;
      return session;
    },
  },
} satisfies NextAuthConfig;
