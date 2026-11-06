import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Phase 6 (§24–§28) on top of the publication made by workflow.spec.ts: a dated cancellation shows on the public
 * page and in ICS (STATUS:CANCELLED, higher SEQUENCE) without its reason, its revocation restores the event; a
 * teacher's absence request is approved by the dispatcher, becomes a calendar event and gets reschedule
 * proposals; a recorded fact is confirmed by the academic section. MUTATES data: run only against a disposable,
 * freshly seeded database with E2E_MUTATING=1. Steps that need lessons in the future or in the past of the
 * current term skip themselves when the clock is outside the demo term.
 */
test.skip(
  process.env.E2E_MUTATING !== "1",
  "mutating operations — set E2E_MUTATING=1 on a disposable seeded DB",
);
test.describe.configure({ mode: "serial" });

const PASSWORD = process.env.DEMO_PASSWORD ?? "demo1234";
const SECRET = "E2E-private-reason-7Q";
const GROUP = { label: "IQ-11/26", slug: "iq-11-26" };
let cancelledUid = "";
let sequenceBefore = 0;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click("button[type=submit]"),
  ]);
}

type Vevent = { uid: string; status: string | null; sequence: number };
function vevents(ics: string): Vevent[] {
  const s = ics.replace(/\r\n[ \t]/g, "");
  return [...s.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(([, b]) => ({
    uid: /UID:(.+)/.exec(b)?.[1].trim() ?? "",
    status: /STATUS:(\w+)/.exec(b)?.[1] ?? null,
    sequence: Number(/SEQUENCE:(\d+)/.exec(b)?.[1] ?? 0),
  }));
}
const groupIcs = async (request: APIRequestContext) => {
  const res = await request.get(`/s/tsue/group/${GROUP.slug}/ics`);
  expect(res.status()).toBe(200);
  return res.text();
};
const isoIn = (days: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test("dispatcher cancels a future lesson; the public page and ICS show it without the reason", async ({
  page,
  request,
}) => {
  await login(page, "dispatcher@tsue.demo");
  const before = new Set(
    vevents(await groupIcs(request))
      .filter((e) => e.status === "CANCELLED")
      .map((e) => e.uid),
  );
  await page.goto("/schedule/changes/new?by=group");
  await page.locator("#pick").selectOption({ label: GROUP.label });
  await page.getByRole("button", { name: "Показать" }).click();
  await page.waitForURL(/[?&]id=/);
  // the whole next week lies in the future
  const url = new URL(page.url());
  const week = Number(url.searchParams.get("w")) + 1;
  url.searchParams.set("w", String(week));
  await page.goto(url.pathname + url.search);
  const edit = page.getByRole("button", { name: "Изменить", exact: true });
  test.skip((await edit.count()) === 0, "no future lessons left in the demo term");
  await edit.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Причина").fill(SECRET);
  await dialog.getByRole("button", { name: "Отменить занятие" }).click();
  await expect(page.getByText("Изменение сохранено").first()).toBeVisible();

  const pub = await request.get(`/s/tsue/group/${GROUP.slug}?w=${week}`);
  expect(pub.status()).toBe(200);
  const html = await pub.text();
  expect(html).toContain("Отменено");
  expect(html).not.toContain(SECRET);

  const ics = await groupIcs(request);
  expect(ics).not.toContain(SECRET);
  const added = vevents(ics).filter((e) => e.status === "CANCELLED" && !before.has(e.uid));
  expect(added).toHaveLength(1);
  cancelledUid = added[0].uid;
  sequenceBefore = added[0].sequence;
});

test("revoking the cancellation restores the ICS event with a higher SEQUENCE", async ({ page, request }) => {
  test.skip(!cancelledUid, "needs the cancellation");
  await login(page, "dispatcher@tsue.demo");
  await page.goto("/schedule/changes");
  await page.getByRole("button", { name: "Отменить изменение", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Причина").fill("Занятие состоится");
  await dialog.getByRole("button", { name: "Отменить изменение", exact: true }).click();
  await expect(page.getByText("Изменение отменено").first()).toBeVisible();
  const ev = vevents(await groupIcs(request)).find((e) => e.uid === cancelledUid);
  expect(ev).toBeDefined();
  expect(ev!.status).not.toBe("CANCELLED");
  expect(ev!.sequence).toBeGreaterThan(sequenceBefore);
});

test("teacher requests an absence; the dispatcher approves it and gets reschedule proposals", async ({
  browser,
}) => {
  test.skip(!cancelledUid, "needs lessons in the future of the demo term");
  const teacher = await (await browser.newContext()).newPage();
  await login(teacher, "teacher@tsue.demo");
  await teacher.goto("/p/teacher");
  await teacher.getByLabel("С", { exact: true }).fill(isoIn(14));
  await teacher.getByLabel("По", { exact: true }).fill(isoIn(15));
  await teacher.getByLabel("Причина").fill(SECRET);
  await teacher.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(teacher.getByText("Заявка отправлена").first()).toBeVisible();

  const page = await (await browser.newContext()).newPage();
  await login(page, "dispatcher@tsue.demo");
  await page.goto("/absences");
  await page
    .locator("tbody tr")
    .filter({ hasText: "Karimov Akmal" })
    .first()
    .getByRole("button", { name: "Одобрить" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Одобрить" }).click();
  await expect(page.getByText("Заявка одобрена").first()).toBeVisible();
  await page.goto("/absences?state=APPROVED");
  const href = await page.getByRole("link", { name: "Событие в календаре" }).first().getAttribute("href");
  expect(href).toMatch(/^\/calendar\//);
  await page.goto(href!);
  await expect(page.getByText(SECRET)).toHaveCount(0); // the event carries no reason
  await page.getByRole("button", { name: /^Подобрать (перенос|заново)$/ }).click();
  await expect(
    page.getByText(/Варианты переноса подобраны|Переносить нечего|не затрагивает/).first(),
  ).toBeVisible();
});

test("a recorded fact is confirmed by the academic section", async ({ browser }) => {
  const teacher = await (await browser.newContext()).newPage();
  await login(teacher, "teacher@tsue.demo");
  await teacher.goto("/p/teacher");
  const held = teacher.getByRole("button", { name: "Проведено", exact: true });
  test.skip((await held.count()) === 0, "no past lessons of the current publication yet");
  await held.first().click();
  await expect(teacher.getByText("Факт сохранён").first()).toBeVisible();

  const page = await (await browser.newContext()).newPage();
  await login(page, "akademik@tsue.demo");
  await page.goto("/plan-fact");
  await page
    .getByRole("link", { name: /Karimov Akmal/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Выбрать все/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Подтвердить/ })
    .first()
    .click();
  await expect(page.getByText("Факты подтверждены").first()).toBeVisible();
});
