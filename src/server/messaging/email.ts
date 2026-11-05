import { Resend } from "resend";
import { log } from "../log";

/** Email adapter. Drivers: resend (production), console (dev: logs only an id, never content), memory (tests). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Idempotency / correlation id (delivery log row id) */
  id?: string;
}
export interface SendResult {
  providerMessageId: string;
}
export interface EmailAdapter {
  name: string;
  send(msg: EmailMessage): Promise<SendResult>;
}

/** Sent messages when EMAIL_DRIVER=memory (tests and e2e inspection). */
export const memoryOutbox: EmailMessage[] = [];

class MemoryEmail implements EmailAdapter {
  name = "memory";
  async send(msg: EmailMessage) {
    memoryOutbox.push(msg);
    return { providerMessageId: `mem_${memoryOutbox.length}` };
  }
}

class ConsoleEmail implements EmailAdapter {
  name = "console";
  async send(msg: EmailMessage) {
    const providerMessageId = `console_${Date.now().toString(36)}`;
    log.info("email.send (console driver)", { providerMessageId, ref: msg.id });
    return { providerMessageId };
  }
}

class ResendEmail implements EmailAdapter {
  name = "resend";
  private client: Resend;
  constructor(
    apiKey: string,
    private from: string,
  ) {
    this.client = new Resend(apiKey);
  }
  async send(msg: EmailMessage) {
    const res = await this.client.emails.send(
      { from: this.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html },
      msg.id ? { idempotencyKey: msg.id } : undefined,
    );
    if (res.error) throw new Error(`Resend error: ${res.error.name}`);
    return { providerMessageId: res.data?.id ?? "unknown" };
  }
}

let adapter: EmailAdapter | null = null;
export function emailAdapter(): EmailAdapter {
  if (adapter) return adapter;
  const driver = process.env.EMAIL_DRIVER ?? "console";
  if (driver === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("EMAIL_DRIVER=resend needs RESEND_API_KEY");
    adapter = new ResendEmail(key, process.env.EMAIL_FROM ?? "Kivi Health <bookings@example.com>");
  } else if (driver === "memory") adapter = new MemoryEmail();
  else adapter = new ConsoleEmail();
  return adapter;
}

/** For tests. */
export function setEmailAdapter(a: EmailAdapter | null) {
  adapter = a;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
