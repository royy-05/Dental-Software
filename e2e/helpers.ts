import { expect, type Page, type APIRequestContext } from "@playwright/test";

export interface DemoInfo {
  users: { email: string; name: string; platformRole: string | null; twoFactor: boolean }[];
  password: string;
  totpCode: string;
}

/** Demo accounts and the current demo 2FA code (DEMO_MODE only). */
export async function demoInfo(request: APIRequestContext): Promise<DemoInfo> {
  const res = await request.get("/api/auth/demo");
  expect(res.ok()).toBeTruthy();
  return res.json();
}

export async function login(page: Page, email: string, opts: { expectPath: RegExp }) {
  const info = await demoInfo(page.request);
  const user = info.users.find((u) => u.email === email);
  if (!user) throw new Error(`Demo user ${email} not found`);
  await page.goto("/login");
  await page.fill("#login-email", email);
  await page.fill("#login-pw", info.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  if (user.twoFactor) {
    await page.waitForSelector("#login-code");
    const fresh = await demoInfo(page.request);
    await page.fill("#login-code", fresh.totpCode);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page).toHaveURL(opts.expectPath, { timeout: 30_000 });
}

export const USERS = {
  super: "jordan@kivihealth.example.com",
  support: "kim@kivihealth.example.com",
  owner: "olivia@brightsmile.example.com",
  manager: "marcus@brightsmile.example.com",
  frontDesk: "fiona@brightsmile.example.com",
};
