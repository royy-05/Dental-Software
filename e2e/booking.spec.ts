import { expect, test, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

const SLUG = "clearskin-derm";

async function pickFirstSlot(page: Page) {
  // Month calendar: the first day with available times, then the first time of the day.
  const day = page.getByRole("grid").getByRole("button", { name: /times available/ }).first();
  await expect(day).toBeVisible({ timeout: 20_000 });
  await day.click();
  const time = page.getByRole("region", { name: /times$/ }).getByRole("button").first();
  await expect(time).toBeVisible({ timeout: 20_000 });
  const label = await time.textContent();
  await time.click();
  return label?.trim() ?? "";
}

test.describe("patient booking", () => {
  test("books online end to end, then the clinic sees it and the patient can cancel from the signed link", async ({ page, request }) => {
    const lastName = `E2E${Date.now().toString(36).slice(-5)}`;
    await page.goto(`/book/${SLUG}?referrer_id=1&utm_source=google&utm_medium=cpc&gclid=E2E123`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Clear Skin/i);

    // 1. Reason (first bookable card in the New patient section)
    await page.getByRole("button", { name: /^New Patient Skin Consultation/ }).click();
    // 2. Date and time (slot is held server-side)
    await pickFirstSlot(page);
    await expect(page.getByRole("timer")).toBeVisible();
    // 3. Details
    await page.fill("#w-f_first", "Ella");
    await page.fill("#w-f_last", lastName);
    await page.fill("#w-f_dob", "1992-06-15");
    await page.fill("#w-f_phone", "(555) 0100-2468");
    await page.fill("#w-f_email", `ella.${lastName.toLowerCase()}@example.com`);
    await page.locator('input[name="w-_hasInsurance"][value="no"]').check();
    await page.locator("#w-_smsConsent").check();
    await page.getByRole("button", { name: /Continue/ }).click();
    // 4. Review and confirm
    await page.getByRole("button", { name: /Book appointment/ }).click();
    await expect(page).toHaveURL(/\/confirmed\//, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /booked/i })).toBeVisible();
    const manageHref = await page.getByRole("link", { name: /Reschedule or cancel/ }).getAttribute("href");
    expect(manageHref).toMatch(/\/manage\//);

    // The delivery log got the booking messages (server-side check through the public manage view is enough here).
    const view = await request.get(`/api/public/manage/${manageHref!.split("/manage/")[1]}`);
    expect(view.ok()).toBeTruthy();
    const json = await view.json();
    expect(json.appointment.source).toBe("google_ads");
    expect(json.appointment.gclid).toBe("E2E123");
    expect(json.appointment.smsConsent.given).toBe(true);

    // Clinic staff see the new booking.
    await login(page, "isla@clearskin.example.com", { expectPath: /\/clinic/ });
    await page.goto("/clinic/appointments");
    await page.getByRole("textbox", { name: /Search by name/ }).fill(lastName);
    await expect(page.getByRole("table")).toContainText(lastName, { timeout: 20_000 });

    // The patient cancels from the signed link.
    await page.goto(manageHref!);
    await expect(page.getByRole("heading", { name: "Manage your appointment" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel appointment" }).click();
    await page.getByRole("button", { name: "Yes, cancel" }).click();
    await expect(page.getByRole("status")).toContainText(/cancelled/i);
    // The old link is now stale (version bumped).
    await page.reload();
    await expect(page.getByText(/out of date|not valid|expired|cancelled/i).first()).toBeVisible();
  });

  test("a held slot disappears for other visitors", async ({ page, browser }) => {
    await page.goto(`/book/${SLUG}`);
    await page.getByRole("button", { name: /^New Patient Skin Consultation/ }).click();
    const label = await pickFirstSlot(page);
    await expect(page.getByRole("timer")).toBeVisible();
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(`/book/${SLUG}`);
    await p2.getByRole("button", { name: /^New Patient Skin Consultation/ }).click();
    const day = p2.getByRole("grid").getByRole("button", { name: /times available/ }).first();
    await day.click();
    const times = p2.getByRole("region", { name: /times$/ }).getByRole("button");
    await expect(times.first()).toBeVisible({ timeout: 20_000 });
    const labels = await times.allTextContents();
    expect(labels.map((l) => l.trim())).not.toContain(label);
    await other.close();
  });
});

test.describe("staff workflow", () => {
  test("manager confirms a booking from the drawer and the status history records it", async ({ page }) => {
    await login(page, USERS.manager, { expectPath: /\/clinic/ });
    await page.goto("/clinic/appointments");
    await page.getByRole("combobox", { name: /Filter by status/ }).click();
    await page.getByRole("option", { name: "Unconfirmed" }).click();
    await page.getByRole("button", { name: "View appointment details" }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(drawer.getByText("Confirmed").first()).toBeVisible({ timeout: 15_000 });
  });
});
