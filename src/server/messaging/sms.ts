import { log } from "../log";

/**
 * SMS adapter interface. The mock driver is used until a provider is chosen (open question in the spec);
 * Twilio and MSG91 drivers are stubs that fail loudly so they cannot be enabled by accident.
 */
export interface SmsMessage {
  to: string;
  body: string;
  from?: string;
  id?: string;
}
export interface SmsAdapter {
  name: string;
  send(msg: SmsMessage): Promise<{ providerMessageId: string }>;
}

export const mockSmsOutbox: SmsMessage[] = [];

/** Records messages in memory; numbers ending in 0000 fail (lets tests and demos show failed deliveries). */
class MockSms implements SmsAdapter {
  name = "mock";
  async send(msg: SmsMessage) {
    if (/0000\D*$/.test(msg.to)) throw new Error("Mock carrier rejected the number");
    mockSmsOutbox.push(msg);
    if (mockSmsOutbox.length > 1000) mockSmsOutbox.shift();
    const providerMessageId = `mock_${Date.now().toString(36)}_${mockSmsOutbox.length}`;
    log.info("sms.send (mock driver)", { providerMessageId, ref: msg.id });
    return { providerMessageId };
  }
}

class TwilioSms implements SmsAdapter {
  name = "twilio";
  async send(): Promise<{ providerMessageId: string }> {
    throw new Error("Twilio driver is a Phase 2B stub: add credentials and implement the Messages API call.");
  }
}

class Msg91Sms implements SmsAdapter {
  name = "msg91";
  async send(): Promise<{ providerMessageId: string }> {
    throw new Error("MSG91 driver is a Phase 2B stub: add the auth key and implement the Flow API call.");
  }
}

let adapter: SmsAdapter | null = null;
export function smsAdapter(): SmsAdapter {
  if (adapter) return adapter;
  const driver = process.env.SMS_DRIVER ?? "mock";
  adapter = driver === "twilio" ? new TwilioSms() : driver === "msg91" ? new Msg91Sms() : new MockSms();
  return adapter;
}

export function setSmsAdapter(a: SmsAdapter | null) {
  adapter = a;
}
