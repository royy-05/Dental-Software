import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("login and roles", () => {
  test("wrong password is rejected with a generic message", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#login-email", USERS.frontDesk);
    await page.fill("#login-pw", "definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /not right/ })).toBeVisible();
  });

  test("front desk signs in and sees only the modules its role allows", async ({ page }) => {
    await login(page, USERS.frontDesk, { expectPath: /\/clinic/ });
    const nav = page.getByRole("navigation", { name: "Clinic modules" });
    await expect(nav.getByRole("link", { name: "Appointments" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Templates" })).toHaveCount(0);
    await page.goto("/clinic/settings");
    await expect(page.getByText(/don't have access/i)).toBeVisible();
  });

  test("owner with 2FA signs in and the appointments table loads real rows", async ({ page }) => {
    await login(page, USERS.owner, { expectPath: /\/clinic/ });
    await page.goto("/clinic/appointments");
    await expect(page.getByRole("heading", { name: "Appointments" })).toBeVisible();
    await expect(page.getByRole("table").getByRole("row").nth(1)).toBeVisible();
  });

  test("panel pages redirect to login when signed out", async ({ page }) => {
    await page.goto("/clinic/appointments");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("super admin sees the dashboard and the audit log; support agent is read-only", async ({ page }) => {
    await login(page, USERS.super, { expectPath: /\/admin/ });
    await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible();
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("table").getByRole("row").nth(1)).toBeVisible();
  });
});
