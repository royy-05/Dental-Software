/** Stand-in for "@/auth" in integration tests: the session id comes from setTestSession(). */
export async function auth() {
  const sid = (globalThis as { __testSid?: string | null }).__testSid;
  return sid ? { sid, user: {}, expires: new Date(Date.now() + 3600_000).toISOString() } : null;
}
export const handlers = {};
export const signIn = async () => undefined;
export const signOut = async () => undefined;
