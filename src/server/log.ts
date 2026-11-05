/**
 * Application logger. Never pass patient data: names, phones, emails and message bodies are redacted
 * by key as a second line of defence.
 */
const REDACT = /^(name|firstName|lastName|patient|phone|email|to|body|subject|dob|message|password|code|token|answers|insurance)$/i;

function scrub(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, REDACT.test(k) ? "[redacted]" : scrub(x, depth + 1)]));
}

function emit(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...(meta ? (scrub(meta) as object) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
