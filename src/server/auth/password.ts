import { hash, verify } from "@node-rs/argon2";

/** Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations, 1 lane). */
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON);
}

export async function verifyPassword(hashed: string | null | undefined, password: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** Used to keep response time similar when the user does not exist (no account enumeration by timing). */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hash("not-a-real-password-0000", ARGON);
  await verifyPassword(await dummyHash, password);
}

const COMMON = new Set(
  [
    "password", "password1", "password123", "123456789012", "qwertyuiopas", "iloveyou1234", "letmein12345",
    "welcome12345", "admin1234567", "changeme1234", "passw0rd1234", "p@ssw0rd1234", "qwerty123456", "abc123456789",
  ].map((s) => s.toLowerCase()),
);

export const PASSWORD_RULES = "At least 12 characters, with 3 of: lower-case, upper-case, number, symbol. Not a common password and not containing your email name.";

/** Password policy (section 8: strong password rules). Returns an error message or null. */
export function checkPasswordStrength(password: string, email?: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) return "Use at least 3 of: lower-case, upper-case, number, symbol.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) return "Password must not contain your email name.";
  return null;
}
