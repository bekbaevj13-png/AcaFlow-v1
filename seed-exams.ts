/**
 * Exam timetable seed (SYNTHETIC, §29): v1 is built greedily from the curricula (one assessment per group
 * per day with a free day in between, examiners = the term's lecturers, rooms by capacity) and published;
 * v2 is a draft copy with edits — a rescheduled exam, an added consultation, a removed credit and a room
 * clash, so the draft shows a blocked publication and a diff. Insert-only: stops when exams exist.
 * Called at the end of prisma/seed.ts; standalone: `npm run db:seed:exams`.
 */
import { PrismaClient } from "@prisma/client";
import { prisma as appDb, tenantDb } from "../src/lib/db";
import { audit } from "../src/lib/audit";
import { hashOf } from "../src/lib/hash";
import { resolveTerm } from "../src/lib/curriculum/cohorts";
import { countIssues, examCanon, examIssues, weekdayOf, type ExamEntryLite } from "../src/lib/exams/rules";
import { examinerHints, examPlan, examWorld, liteOf } from "../src/lib/exams/service";

type Db = PrismaClient;
const SYS = "Seed (synthetic)";
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function seedExams(db: Db, tenantSlug = "tsue") {
  try {
    await seed(db, tenantSlug);
  } finally {
    await appDb.$disconnect();
  }
}

async function seed(db: Db, tenantSlug: string) {
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant ${tenantSlug} not found`);
  const T = tenant.id;
  if (await db.examSchedule.count({ where: { tenantId: T } })) {
    console.log("Exam seed: exam timetables already exist — nothing to do.");
    return;
  }
  const tdb = tenantDb(T);
  const actor = { system: SYS, tenantId: T };
  const { term, current } = await resolveTerm(tdb);
  if (!term) throw new Error("no term");
  const dispatcher = (await db.user.findUniqueOrThrow({ where: { email: "dispatcher@tsue.demo" } })).id;

  // session: the two weeks after the last teaching week; New Year's Day is a holiday
  const sessionStart = addDays(term.startDate.toISOString().slice(0, 10), term.weeks * 7);
  const ny = `${Number(sessionStart.slice(0, 4)) + (sessionStart.slice(5, 7) === "01" ? 0 : 1)}-01-01`;
  if (
    !(await db.calendarEvent.findFirst({
      where: { tenantId: T, typeCode: "HOLIDAY", dateFrom: new Date(ny) },
    }))
  )
    await db.calendarEvent.create({
      data: {
        tenantId: T,
        typeCode: "HOLIDAY",
        title: "Yangi yil",
        dateFrom: new Date(ny),
        dateTo: new Date(ny),
      },
    });
  const world = await examWorld(tdb);
  const days: string[] = [];
  for (let d = sessionStart; days.length < 22; d = addDays(d, 1))
    if (weekdayOf(d) !== 7 && !world.holidays.some((h) => !h.facultyId && h.from <= d && d <= h.to))
      days.push(d);

  const [plan, hints, groups, rooms, subjects, depTeachers] = await Promise.all([
    examPlan(tdb, term, current),
    examinerHints(tdb, term.id),
    tdb.studentGroup.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    tdb.room.findMany({ where: { active: true }, include: { roomType: true, building: true } }),
    tdb.subject.findMany(),
    db.teacherDepartment.findMany({
      where: { teacher: { tenantId: T, active: true } },
      orderBy: { teacher: { fullName: "asc" } },
    }),
  ]);
  const subjectDep = new Map(subjects.map((s) => [s.id, s.departmentId]));
  const examRooms = rooms
    .filter((r) => r.roomType.code === "SEMINAR" || r.roomType.code === "LECTURE")
    .sort(
      (a, b) =>
        a.approvedMaximumCapacity - b.approvedMaximumCapacity ||
        a.building.code.localeCompare(b.building.code) ||
        a.roomNumber.localeCompare(b.roomNumber),
    );
  const subjectCode = new Map(subjects.map((s) => [s.id, s.code]));

  // greedy placement over (day, slot) with a local feasibility check, verified by examIssues below
  const placed: ExamEntryLite[] = [];
  const busy = (date: string, s: number, e: number, pred: (x: ExamEntryLite) => boolean) =>
    placed.some((x) => x.date === date && pred(x) && x.startMin < e && s < x.startMin + x.durationMin);
  let n = 0;
  for (const g of groups) {
    const items = [...(plan[g.id] ?? [])].sort(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === "CREDIT" ? -1 : 1) ||
        (subjectCode.get(a.subjectId) ?? "").localeCompare(subjectCode.get(b.subjectId) ?? ""),
    );
    let next = g.courseYear % 2 ? 0 : 1; // stagger the courses
    for (const it of items) {
      const dur = it.kind === "EXAM" ? 120 : 90;
      const examiner =
        (hints[`${g.id}|${it.subjectId}`] ?? [])[0] ??
        depTeachers.find((d) => d.departmentId === subjectDep.get(it.subjectId))?.teacherId ??
        null;
      const slots = g.courseYear % 2 ? [540, 810] : [810, 540];
      let done = false;
      for (let di = next; di < days.length && !done; di++)
        for (const start of slots) {
          const date = days[di];
          const end = start + dur;
          if (busy(date, start, end, (x) => x.groupId === g.id)) continue;
          if (examiner && busy(date, start, end, (x) => x.examinerIds.includes(examiner))) continue;
          const room = examRooms.find(
            (r) =>
              r.approvedMaximumCapacity >= g.studentCount &&
              !busy(date, start, end, (x) => x.roomIds.includes(r.id)),
          );
          if (!room) continue;
          placed.push({
            id: `seed-${n++}`,
            groupId: g.id,
            subjectId: it.subjectId,
            kind: it.kind,
            date,
            startMin: start,
            durationMin: dur,
            roomIds: [room.id],
            examinerIds: examiner ? [examiner] : [],
          });
          next = di + world.minGapDays;
          done = true;
          break;
        }
      if (!done) console.warn("Exam seed: could not place", g.code, it.subjectId);
    }
  }
  const v1Counts = countIssues(examIssues(world, placed));
  if (v1Counts.hard) throw new Error(`exam seed v1 has ${v1Counts.hard} hard conflicts`);

  const now = Date.now();
  const v1 = await db.examSchedule.create({
    data: {
      tenantId: T,
      termId: term.id,
      version: 1,
      name: "Qishki sessiya (sintetik)",
      source: "MANUAL",
      createdById: dispatcher,
      createdAt: new Date(now - 864e5 * 6),
    },
  });
  const rowOf = (s: string, e: ExamEntryLite) => ({
    tenantId: T,
    scheduleId: s,
    groupId: e.groupId,
    subjectId: e.subjectId,
    kind: e.kind,
    date: new Date(`${e.date}T00:00:00Z`),
    startMin: e.startMin,
    durationMin: e.durationMin,
    roomIds: e.roomIds,
    examinerIds: e.examinerIds,
  });
  await db.examEntry.createMany({ data: placed.map((e) => rowOf(v1.id, e)) });
  const v1Entries = (await db.examEntry.findMany({ where: { scheduleId: v1.id } })).map(liteOf);
  await db.examSchedule.update({
    where: { id: v1.id },
    data: {
      status: "PUBLISHED",
      contentHash: hashOf(examCanon(v1Entries)),
      publishedById: dispatcher,
      publishedAt: new Date(now - 864e5 * 5),
    },
  });
  await audit(db as never, actor, {
    action: "EXAM_SCHEDULE_CREATE",
    entityType: "ExamSchedule",
    entityId: v1.id,
    after: { version: 1, name: v1.name, source: "MANUAL", entries: v1Entries.length },
  });
  await audit(db as never, actor, {
    action: "EXAM_PUBLISH",
    entityType: "ExamSchedule",
    entityId: v1.id,
    after: { status: "PUBLISHED", version: 1, entries: v1Entries.length },
  });
  // notifications as the publication would send them (one per examiner)
  const examiners = [...new Set(v1Entries.flatMap((e) => e.examinerIds))].sort();
  const members = await db.tenantMembership.findMany({
    where: { tenantId: T, teacherId: { in: examiners } },
    select: { teacherId: true, userId: true },
  });
  const userOf = new Map(members.map((m) => [m.teacherId!, m.userId]));
  await db.notification.createMany({
    data: examiners.map((teacherId) => ({
      tenantId: T,
      teacherId,
      userId: userOf.get(teacherId) ?? null,
      channel: "WEB",
      deliveryKey: `exam:${v1.id}:T:${teacherId}`,
      title: "Exam timetable v1 published",
      body: {
        kind: "EXAMS_PUBLISHED",
        scheduleId: v1.id,
        version: 1,
        changed: false,
        mine: v1Entries.filter((e) => e.examinerIds.includes(teacherId)).length,
      },
      createdAt: new Date(now - 864e5 * 5),
    })),
  });

  // v2 draft: copy + edits
  const code = new Map(subjects.map((s) => [s.code, s.id]));
  const gid = new Map(groups.map((g) => [g.code, g.id]));
  const v2rows = v1Entries.map((e) => ({ ...e }));
  const find = (g: string, s: string) =>
    v2rows.find((e) => e.groupId === gid.get(g) && e.subjectId === code.get(s));
  const notes: Record<string, string> = {};
  const added: ExamEntryLite[] = [];
  const removed = find("RI-21/25i", "PYTHON") ?? find("RI-21/25i", "INGLIZ");
  const live = () => [...v2rows.filter((e) => e !== removed), ...added];
  /** issue codes of one sitting after an edit (the edit is reverted when `accept` says no) */
  const codesOf = (id: string) =>
    examIssues(world, live())
      .filter((i) => i.entryId === id)
      .map((i) => i.code);
  const tryEdit = (e: ExamEntryLite, patch: Partial<ExamEntryLite>, accept: (codes: string[]) => boolean) => {
    const before = { ...e };
    Object.assign(e, patch);
    if (accept(codesOf(e.id))) return true;
    Object.assign(e, before);
    return false;
  };
  const clean = (c: string[]) => !c.length;
  // (a) rescheduled exam: a later session day without new issues
  const moved = find("IQ-12/26", "IQTNAZ");
  if (moved) {
    const i = days.indexOf(moved.date);
    const size = world.groups[moved.groupId]?.size ?? 0;
    const roomsFor = [
      ...moved.roomIds,
      ...examRooms
        .filter((r) => r.approvedMaximumCapacity >= size && !moved.roomIds.includes(r.id))
        .map((r) => r.id),
    ];
    let ok = false;
    for (const k of [1, 2, 3, -1, -2, 0])
      for (const start of [moved.startMin, moved.startMin === 540 ? 810 : 540])
        for (const room of roomsFor)
          if (!ok && days[i + k] && !(k === 0 && start === moved.startMin))
            ok = tryEdit(moved, { date: days[i + k], startMin: start, roomIds: [room] }, clean);
    if (ok) notes[moved.id] = "Ko‘chirildi: kafedra iltimosi (sintetik)";
  }
  // (b) consultation the day before an exam
  const mikro = find("IQ-11/26", "MIKRO");
  if (mikro) {
    const i = days.indexOf(mikro.date);
    const cons: ExamEntryLite = { ...mikro, id: "seed-cons", kind: "CONSULTATION", durationMin: 60 };
    added.push(cons);
    let ok = false;
    for (const d of [days[i - 1], days[i - 2]].filter(Boolean))
      for (const start of [960, 1020, 900, 840, 480])
        if (!ok && tryEdit(cons, { date: d, startMin: start }, clean)) ok = true;
    if (!ok) added.pop();
  }
  // (d) a room clash: BH-11/26 OLIYMAT is moved into the room and time of another group's sitting
  const clash = find("BH-11/26", "OLIYMAT");
  if (clash)
    for (const other of v2rows) {
      if (other === clash || other === removed || other.groupId === clash.groupId) continue;
      if (
        tryEdit(
          clash,
          { date: other.date, startMin: other.startMin, roomIds: [...other.roomIds] },
          (c) => c.length === 1 && c[0] === "ROOM_OVERLAP",
        )
      ) {
        notes[clash.id] = "Xona almashtirildi (sintetik konflikt)";
        break;
      }
    }
  const v2 = await db.examSchedule.create({
    data: {
      tenantId: T,
      termId: term.id,
      version: 2,
      name: "Qishki sessiya — tuzatishlar (sintetik)",
      source: "COPY",
      previousId: v1.id,
      createdById: dispatcher,
      createdAt: new Date(now - 864e5 * 2),
    },
  });
  await db.examEntry.createMany({
    data: live().map((e) => ({
      ...rowOf(v2.id, e),
      notes: notes[e.id] ?? null,
    })),
  });
  await audit(db as never, actor, {
    action: "EXAM_SCHEDULE_CREATE",
    entityType: "ExamSchedule",
    entityId: v2.id,
    after: { version: 2, name: v2.name, source: "COPY", copiedFrom: 1 },
  });
  const v2Counts = countIssues(
    examIssues(world, (await db.examEntry.findMany({ where: { scheduleId: v2.id } })).map(liteOf)),
  );
  console.log("Exam seed complete (synthetic):", {
    v1: { entries: v1Entries.length, soft: v1Counts.soft },
    v2: { hard: v2Counts.hard, soft: v2Counts.soft },
  });
}

if (process.argv[1]?.endsWith("seed-exams.ts")) {
  const db = new PrismaClient();
  seedExams(db)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
