import { z } from "zod";

/**
 * Environment validation (Section 8 Security & Setup Hardening).
 * Validates all required environment variables at startup using Zod.
 * If something is missing or malformed, fails with a clear explanation
 * of what is wrong and exact instructions on how to set it.
 */

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    POSTGRES_PORT: z.string().optional().default("5432"),

    // Database connections
    DATABASE_URL: z
      .string({
        required_error: "DATABASE_URL is required. Set it to the runtime connection (kivi_app role). Example: postgresql://kivi_app:kivi_app_local_only@localhost:5432/kivi",
      })
      .min(1, "DATABASE_URL cannot be empty."),
    DIRECT_DATABASE_URL: z
      .string({
        required_error: "DIRECT_DATABASE_URL is required. Set it to the migration/owner connection (kivi role). Example: postgresql://kivi:kivi_local_only@localhost:5432/kivi",
      })
      .min(1, "DIRECT_DATABASE_URL cannot be empty."),
    TEST_DATABASE_URL: z.string().optional(),
    TEST_DIRECT_DATABASE_URL: z.string().optional(),

    // Secrets & Cryptography
    AUTH_SECRET: z
      .string({
        required_error: "AUTH_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      })
      .min(16, "AUTH_SECRET must be at least 16 characters (recommended 32 bytes base64)."),
    AUTH_TRUST_HOST: z.string().optional().default("true"),
    APP_ENCRYPTION_KEY: z
      .string({
        required_error: "APP_ENCRYPTION_KEY is required. Generate a 32-byte base64 string with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      })
      .refine(
        (val) => {
          try {
            return Buffer.from(val, "base64").length === 32;
          } catch {
            return false;
          }
        },
        {
          message: "APP_ENCRYPTION_KEY must be exactly 32 bytes when base64 decoded. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
        },
      ),
    LINK_SIGNING_SECRET: z
      .string({
        required_error: "LINK_SIGNING_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
      })
      .min(16, "LINK_SIGNING_SECRET must be at least 16 characters."),

    // Application & Messaging
    APP_BASE_URL: z.string().url("APP_BASE_URL must be a valid URL (e.g. http://localhost:3000)").default("http://localhost:3000"),
    EMAIL_DRIVER: z.enum(["resend", "console", "memory"]).default("console"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Kivi Health <bookings@example.com>"),
    SMS_DRIVER: z.enum(["mock", "twilio", "msg91"]).default("mock"),
    SMS_WEBHOOK_SECRET: z.string().optional(),

    // Demo Mode & Testing
    DEMO_MODE: z.string().optional(),
    SEED_DEMO_PASSWORD: z.string().default("Demo-Passw0rd-2026"),
    TRUST_PROXY: z.string().optional(),
    PRISMA_LOG: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Security check: DEMO_MODE must NEVER be enabled in production
    if (data.NODE_ENV === "production" && data.DEMO_MODE === "true") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEMO_MODE"],
        message: "SECURITY VIOLATION: DEMO_MODE cannot be enabled in production (NODE_ENV=production). Set DEMO_MODE=false or remove it from .env.",
      });
    }

    // If EMAIL_DRIVER is resend, RESEND_API_KEY is required
    if (data.EMAIL_DRIVER === "resend" && (!data.RESEND_API_KEY || data.RESEND_API_KEY.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when EMAIL_DRIVER is set to 'resend'. Obtain an API key from https://resend.com or set EMAIL_DRIVER=console.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env | null = null;

export function validateEnv(customEnv?: Record<string, string | undefined>): Env {
  const source = customEnv ?? process.env;
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const errorMessages = result.error.issues.map((issue) => {
      const varName = issue.path.join(".");
      return `  ❌ [${varName}]: ${issue.message}`;
    });

    const header = "\n=======================================================\n🛑 ENVIRONMENT CONFIGURATION ERROR\n=======================================================";
    const footer = "Please check your .env file or environment variables.\nSee .env.example for required settings.\n=======================================================\n";

    const fullMessage = `${header}\n${errorMessages.join("\n")}\n${footer}`;
    console.error(fullMessage);
    throw new Error(`Environment validation failed:\n${errorMessages.join("\n")}`);
  }

  return result.data;
}

export function env(): Env {
  if (!parsedEnv) {
    parsedEnv = validateEnv();
  }
  return parsedEnv;
}

export const isDemoMode = (): boolean => {
  const e = env();
  return e.NODE_ENV !== "production" && e.DEMO_MODE === "true";
};

export function linkSecret(): string {
  const s = env().LINK_SIGNING_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "test") return "test-link-secret-0123456789";
    throw new Error("LINK_SIGNING_SECRET is not set");
  }
  return s;
}

export function encryptionKey(): Buffer {
  const raw = env().APP_ENCRYPTION_KEY;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return key;
}
