import { z } from "zod";

/** Server environment, validated on first use. See .env.example. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16).optional(),
  APP_ENCRYPTION_KEY: z.string().min(1).optional(),
  LINK_SIGNING_SECRET: z.string().min(16).optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  EMAIL_DRIVER: z.enum(["resend", "console", "memory"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Kivi Health <bookings@example.com>"),
  SMS_DRIVER: z.enum(["mock", "twilio", "msg91"]).default("mock"),
  SMS_WEBHOOK_SECRET: z.string().optional(),
  DEMO_MODE: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export const isDemoMode = () => process.env.DEMO_MODE === "true";

export function linkSecret(): string {
  const s = process.env.LINK_SIGNING_SECRET ?? (process.env.NODE_ENV === "test" ? "test-link-secret-0123456789" : undefined);
  if (!s) throw new Error("LINK_SIGNING_SECRET is not set");
  return s;
}
