import { expect, test, type Page } from "@playwright/test";

/**
 * Full MVP vertical (§53 Phase 3–5): generation → variant choice → board → submit → approve → publish →
 * teacher acknowledgement → public page. MUTATES data: run only against a disposable, freshly seeded
 * database (CI does this). Enable with E2E_MUTATING=1.
 */
test.skip(
  process.env.E2E_MUTATING !== "1",
  "mutating workflow — set E2E_MUTATING=1 on a disposable seeded DB",
);
test.describe.configure({ mode: "serial" });

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";
let versionId = "";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click("button[type=submit]"),
  ]);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

test("dispatcher generates variants and picks a verified one", async ({ page }) => {
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await login(page, "dispatcher@tsue.demo");
  await page.goto("/schedule/generate");
  await page.selectOption("#g-var", "3");
  await page.selectOption("#g-lim", "30");
  await page.click("form button[type=submit]");
  await page.waitForURL(/run=/);
  const compare = page.getByText("Сравнение вариантов");
  await expect(async () => {
    if (!(await compare.isVisible())) await page.reload();
    await expect(compare).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 360_000, intervals: [5_000] });
  await Promise.all([
    page.waitForURL(/\/schedule\?v=/),
    page.locator("button:has-text('Выбрать'):not([disabled])").first().click(),
  ]);
  versionId = new URL(page.url()).searchParams.get("v") ?? "";
  expect(versionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("board: keyboard views and submit for approval", async ({ page }) => {
  test.skip(!versionId, "needs the generated version");
  const errors = collectErrors(page);
  await login(page, "dispatcher@tsue.demo");
  await page.goto(`/schedule?v=${versionId}`);
  await expect(page.locator('[aria-roledescription="draggable"]').first()).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Режим доски" }).getByRole("tab");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("2");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("1");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  const submit = page.getByRole("button", { name: "Отправить на утверждение" });
  await expect(submit).toBeEnabled(); // solver variants have no hard conflicts and no unplaced sessions
  await submit.click();
  await expect(page.getByText("Версия отправлена на утверждение")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("head of academic section approves the submitted version", async ({ page }) => {
  test.skip(!versionId, "needs the generated version");
  await login(page, "akademik@tsue.demo");
  await page.goto("/schedule/versions");
  await page.getByRole("button", { name: "Утвердить" }).first().click();
  await page.fill("#cmt", "E2E: жёстких нарушений нет.");
  await page.getByRole("dialog").getByRole("button", { name: "Утвердить" }).click();
  await expect(page.getByText("Версия утверждена")).toBeVisible();
});

test("dispatcher publishes with an effective date", async ({ page }) => {
  test.skip(!versionId, "needs the generated version");
  await login(page, "dispatcher@tsue.demo");
  await page.goto("/schedule/versions");
  await page.getByRole("button", { name: "Опубликовать" }).first().click();
  await expect(page.locator("#eff")).not.toHaveValue("");
  await page.getByRole("dialog").getByRole("button", { name: "Опубликовать" }).click();
  await expect(page.getByText("Версия опубликована")).toBeVisible();
});

test("teacher acknowledges the new publication; public page and ICS still serve", async ({ page }) => {
  test.skip(!versionId, "needs the generated version");
  await login(page, "teacher@tsue.demo");
  await page.goto("/p/teacher");
  const ack = page.getByRole("button", { name: "Ознакомлен(а)" });
  await expect(ack).toBeVisible();
  await ack.click();
  await expect(page.getByText("Ознакомление подтверждено", { exact: true }).first()).toBeVisible();
  const res = await page.request.get("/s/tsue/group/iq-11-26");
  expect(res.status()).toBe(200);
});
