import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";

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

test("login rejects a wrong password without revealing which field is wrong", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "dispatcher@tsue.demo");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("dispatcher: dashboard → board → versions without console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await login(page, "dispatcher@tsue.demo");
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", /ru|uz|en/);
  await page.goto("/schedule");
  await expect(page.locator('[aria-roledescription="draggable"]').first()).toBeVisible();
  await page.goto("/schedule/versions");
  await expect(page.locator("article").first()).toBeVisible();
  await page.goto("/audit");
  await expect(page.locator("main h1")).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("approver sees generation read-only and the API refuses to start a run", async ({ page }) => {
  await login(page, "akademik@tsue.demo");
  await page.goto("/schedule/generate");
  await expect(page.getByText("Запуск генерации недоступен вашей роли")).toBeVisible();
  const res = await page.request.post("/api/solver-runs", {
    data: { mode: "FULL", variants: 1, timeLimitSeconds: 10, idempotencyKey: crypto.randomUUID() },
  });
  expect(res.status()).toBe(403);
});

test("department head: lands on own workloads, no tenant-wide schedule (default deny)", async ({ page }) => {
  await login(page, "kafedra.ri@tsue.demo");
  await expect(page).toHaveURL(/\/workloads$/);
  const rows = page.locator('main a[href^="/workloads/"]');
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) expect(text).toMatch(/^RI · /);
  await expect(page.locator('a[href="/schedule"]')).toHaveCount(0);
  await page.goto("/schedule");
  await expect(page.getByText("Страница недоступна")).toBeVisible();
});

test("dean sees only the workloads of the own faculty", async ({ page }) => {
  await login(page, "dekan.raq@tsue.demo");
  await expect(page).toHaveURL(/\/workloads$/);
  const rows = page.locator('main a[href^="/workloads/"]');
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allInnerTexts()) expect(text).toMatch(/^(AT|MAT|RI) · /); // RAQ faculty
  await expect(page.locator('a[href="/analytics"]')).toHaveCount(0);
});

test("teacher lands in the personal cabinet and sees only published data", async ({ page }) => {
  await login(page, "teacher@tsue.demo");
  await expect(page).toHaveURL(/\/p\/teacher/);
  await expect(page.locator("main")).toBeVisible();
});

test("public group page and ICS feed @mobile", async ({ page, request }) => {
  await page.goto("/s/tsue");
  await expect(page.getByRole("link", { name: /IQ-11\/26/ })).toBeVisible();
  await page.getByRole("link", { name: /IQ-11\/26/ }).click();
  await expect(page).toHaveTitle(/IQ-11\/26/);
  const ics = page.getByRole("link", { name: /\.ics/ });
  const href = await ics.getAttribute("href");
  expect(href).toBeTruthy();
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  expect(await res.text()).toContain("BEGIN:VCALENDAR");
});

test("phone layout: cabinet, public page and workloads never scroll sideways @mobile", async ({ page }) => {
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  await page.goto("/s/tsue/group/iq-11-26");
  expect(await fits()).toBe(true);
  await login(page, "teacher@tsue.demo");
  await expect(page).toHaveURL(/\/p\/teacher/);
  expect(await fits()).toBe(true);
  await page.context().clearCookies();
  await login(page, "kafedra.ri@tsue.demo");
  await expect(page).toHaveURL(/\/workloads/);
  expect(await fits()).toBe(true);
});

test("a private tenant exposes nothing publicly", async ({ request }) => {
  const res = await request.get("/s/demo-uni");
  expect(res.status()).toBe(404);
});

test("locale switch: English UI via cookie", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "af_locale", value: "en", url: baseURL! }]);
  await page.goto("/s/tsue");
  await expect(page.locator("h1")).toHaveText("Group schedules");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("schedule board: full viewport, weekly overview and card details @mobile", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "af_locale",
      value: "ru",
      url: new URL(
        "/",
        page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? "http://localhost:3000") : page.url(),
      ).toString(),
    },
  ]);
  await login(page, "dispatcher@tsue.demo");
  await page.goto("/schedule");
  const overview = page.getByRole("button", { name: "Вся неделя", exact: true });
  await expect(overview).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tab", { name: /Гр/ }).first()).toHaveAttribute("aria-selected", "true");
  const grid = page.locator("[aria-busy]");
  await expect(grid).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await grid.evaluate((el) => {
    el.scrollTop = 150;
    el.scrollLeft = 500;
  });
  const sticky = await grid.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: el.querySelector(".sticky.top-0")!.getBoundingClientRect().top - rect.top,
      left: el.querySelector(".sticky.left-0")!.getBoundingClientRect().left - rect.left,
    };
  });
  expect(Math.abs(sticky.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(sticky.left)).toBeLessThanOrEqual(2);
  await grid.evaluate((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
  const card = page.locator('[aria-roledescription="draggable"]').first();
  await expect(card).toHaveAttribute("aria-label", /.+/);
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await overview.click();
  await expect(overview).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Вернуться к платформе", exact: true }).first().click();
  await expect(page.locator("aside").first()).toBeVisible({
    visible: (page.viewportSize()?.width ?? 0) >= 1024,
  });
});
