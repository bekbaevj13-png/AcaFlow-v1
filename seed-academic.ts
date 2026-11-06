/**
 * Academic-process seed (SYNTHETIC): curricula derived from the seeded workloads, elective blocks and
 * choices, syllabi with review states. Insert-only and idempotent: it stops when curricula already exist.
 * Called at the end of prisma/seed.ts; can also be run alone on an existing demo database
 * (`npm run db:seed:academic`).
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { contentHash, intakeYearFor, semesterFor, termParity, toItemData } from "../src/lib/curriculum/model";
import { putObject } from "../src/lib/import/storage";
import { minimalPdf } from "../src/lib/demo/minimal-pdf";

type Db = PrismaClient;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const ACT = {
  LECTURE: "lectureHours",
  SEMINAR: "seminarHours",
  PRACTICE: "practiceHours",
  LAB: "labHours",
} as const;

export async function seedAcademic(db: Db, tenantSlug = "tsue") {
  const tenant = await db.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`tenant ${tenantSlug} not found`);
  const T = tenant.id;
  if (await db.curriculum.count({ where: { tenantId: T } })) {
    console.log("Academic seed: curricula already exist — nothing to do.");
    return;
  }
  const term = await db.term.findFirstOrThrow({
    where: { tenantId: T, current: true },
    include: { academicYear: true },
  });
  const user = async (email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).id;
  const dispatcher = await user("dispatcher@tsue.demo");
  const approver = await user("departament@tsue.demo");
  const now = Date.now();
  const dep = Object.fromEntries(
    (await db.department.findMany({ where: { tenantId: T } })).map((d) => [d.code, d.id]),
  );

  // extra subjects for elective blocks and later semesters
  for (const [code, name, shortName, d] of [
    ["BIZETIKA", "Biznes etikasi", "Biznes etikasi", "TARIX"],
    ["MARKETING", "Marketing asoslari", "Marketing", "MIKRO"],
    ["PYTHON", "Python dasturlash", "Python", "AT"],
    ["BIGDATA", "Katta ma’lumotlar tahlili", "Big Data", "AT"],
  ])
    if (!(await db.subject.findFirst({ where: { tenantId: T, code } })))
      await db.subject.create({ data: { tenantId: T, code, name, shortName, departmentId: dep[d] } });
  const subj = Object.fromEntries(
    (await db.subject.findMany({ where: { tenantId: T } })).map((s) => [s.code, s]),
  );

  // cohorts of the current term
  const parity = termParity(term.startDate);
  const groups = await db.studentGroup.findMany({
    where: { tenantId: T, active: true },
    include: { program: true, subgroups: true },
    orderBy: { code: "asc" },
  });
  const cohorts = new Map<string, typeof groups>();
  for (const g of groups) {
    const k = `${g.programId}|${intakeYearFor(term.academicYear.startDate, g.courseYear)}`;
    cohorts.set(k, [...(cohorts.get(k) ?? []), g]);
  }
  const approved = await db.workload.findMany({
    where: { tenantId: T, termId: term.id, status: "APPROVED" },
  });
  const assignments = await db.teachingAssignment.findMany({
    where: { tenantId: T, workloadId: { in: approved.map((w) => w.id) } },
    include: { audienceSet: true, subject: true },
  });
  const streamsOf = new Map<string, string[]>();
  for (const sg of await db.streamGroup.findMany({ where: { stream: { tenantId: T } } }))
    streamsOf.set(sg.groupId, [...(streamsOf.get(sg.groupId) ?? []), sg.streamId]);
  const covers = (a: (typeof assignments)[number], g: (typeof groups)[number]) =>
    a.audienceSet.groupId === g.id ||
    (!!a.audienceSet.subgroupId && g.subgroups.some((s) => s.id === a.audienceSet.subgroupId)) ||
    (!!a.audienceSet.streamId && (streamsOf.get(g.id) ?? []).includes(a.audienceSet.streamId));

  type Item = ReturnType<typeof blank>;
  const blank = (subjectId: string, semester: number) => ({
    tenantId: T,
    subjectId,
    semester,
    moduleCode: null as string | null,
    kind: "MANDATORY",
    electiveBlock: null as string | null,
    totalHours: 0,
    lectureHours: 0,
    seminarHours: 0,
    practiceHours: 0,
    labHours: 0,
    consultationHours: 0,
    selfStudyHours: 0,
    control: "EXAM",
    weekFrom: 1,
    weekTo: 16 as number | null,
    language: null as string | null,
    audienceKind: "GROUP",
  });
  const finish = (i: Item) => {
    const classroom = i.lectureHours + i.seminarHours + i.practiceHours + i.labHours;
    i.selfStudyHours = classroom;
    i.totalHours = classroom * 2 + i.consultationHours;
    return i;
  };
  const extra = (code: string, sem: number, h: Partial<Item>) =>
    finish({ ...blank(subj[code].id, sem), ...h });

  let curricula = 0;
  const iqDraft: { id?: string; items?: Item[] } = {};
  for (const [key, members] of [...cohorts.entries()].sort()) {
    const [programId, intakeS] = key.split("|");
    const intake = Number(intakeS);
    const g = members[0];
    const sem = semesterFor(g.courseYear, parity);
    const bySubject = new Map<string, Item>();
    for (const a of assignments.filter((x) => covers(x, g))) {
      const it = bySubject.get(a.subjectId) ?? blank(a.subjectId, sem);
      const field = ACT[a.activityType];
      it[field] = Math.max(it[field], Number(a.rawHours));
      it.moduleCode = a.moduleCode;
      it.weekFrom = a.weekFrom;
      it.weekTo = a.weekTo;
      if (a.activityType === "LECTURE" && a.audienceSet.kind === "STREAM") it.audienceKind = "STREAM";
      if (["INGLIZ", "TARIX"].includes(a.subject.code)) it.control = "CREDIT";
      bySubject.set(a.subjectId, it);
    }
    const items = [...bySubject.values()].map(finish);
    const next = sem + 1;
    if (g.courseYear === 1)
      items.push(
        extra("MAKRO", next, { lectureHours: 32, seminarHours: 32 }),
        extra("STAT", next, { lectureHours: 32, seminarHours: 32 }),
        extra("INGLIZ", next, { practiceHours: 64, control: "CREDIT" }),
      );
    else
      items.push(
        extra("EKONOM", next, { lectureHours: 32, seminarHours: 32 }),
        extra("SOLIQ", next, { lectureHours: 32, seminarHours: 32, consultationHours: 4 }),
        extra("INGLIZ", next, { practiceHours: 32, control: "CREDIT" }),
      );
    if (g.courseYear === 2 && ["IQ", "RI", "BI"].includes(g.program.code)) {
      const [a, b] = g.program.code === "IQ" ? ["BIZETIKA", "MARKETING"] : ["PYTHON", "BIGDATA"];
      for (const code of [a, b])
        items.push(
          extra(code, sem, {
            kind: "ELECTIVE",
            electiveBlock: "T-1",
            lectureHours: 16,
            ...(code === "PYTHON" || code === "BIGDATA" ? { labHours: 32 } : { seminarHours: 16 }),
            control: "CREDIT",
          }),
        );
    }
    const c = await db.curriculum.create({
      data: { tenantId: T, programId, intakeYear: intake, name: `${g.program.name} — ${intake} (SYNTHETIC)` },
    });
    // items can only be written while the version is a draft (DB trigger) — approve afterwards
    const v = await db.curriculumVersion.create({
      data: {
        tenantId: T,
        curriculumId: c.id,
        version: 1,
        source: "MANUAL",
        note: "Синтетический план, построен из демо-нагрузки",
        createdById: dispatcher,
        createdAt: new Date(now - 864e5 * 45),
      },
    });
    await db.curriculumItem.createMany({ data: items.map((i) => ({ ...i, versionId: v.id })) });
    await db.curriculumVersion.update({
      where: { id: v.id },
      data: {
        status: "APPROVED",
        approvedById: approver,
        approvedAt: new Date(now - 864e5 * 40),
        contentHash: contentHash(items.map((i) => toItemData(i))),
      },
    });
    curricula++;
    if (g.program.code === "IQ" && intake === intakeYearFor(term.academicYear.startDate, 1)) {
      iqDraft.id = c.id;
      iqDraft.items = items;
    }
  }

  // IQ 2026: draft v2 with changes (diff + approval demo; authored by the dispatcher)
  if (iqDraft.id && iqDraft.items) {
    const v2 = await db.curriculumVersion.create({
      data: {
        tenantId: T,
        curriculumId: iqDraft.id,
        version: 2,
        source: "COPY",
        sourceName: "v1",
        note: "синтетическое предложение изменений",
        createdById: dispatcher,
        createdAt: new Date(now - 864e5 * 2),
      },
    });
    const items = iqDraft.items
      .filter((i) => !(i.subjectId === subj.STAT.id && i.semester === 2))
      .map((i) => (i.subjectId === subj.MIKRO.id ? finish({ ...i, seminarHours: 48 }) : i));
    items.push(extra("RAQIQT", 2, { lectureHours: 16, seminarHours: 16 }));
    await db.curriculumItem.createMany({ data: items.map((i) => ({ ...i, versionId: v2.id })) });
  }

  // elective choices for the current term (one group without a choice, one revoked choice in history)
  const items = await db.curriculumItem.findMany({
    where: { tenantId: T, kind: "ELECTIVE", version: { status: "APPROVED" } },
    include: { version: { include: { curriculum: true } }, subject: true },
  });
  const choose = async (groupCode: string, subjectCode: string, revoked = false) => {
    const g = groups.find((x) => x.code === groupCode);
    if (!g) return;
    const intake = intakeYearFor(term.academicYear.startDate, g.courseYear);
    const it = items.find(
      (i) =>
        i.version.curriculum.programId === g.programId &&
        i.version.curriculum.intakeYear === intake &&
        i.subject.code === subjectCode,
    );
    if (!it) return;
    await db.electiveChoice.create({
      data: {
        tenantId: T,
        termId: term.id,
        groupId: g.id,
        curriculumItemId: it.id,
        subjectId: it.subjectId,
        block: it.electiveBlock ?? "T-1",
        source: "MANUAL",
        createdById: dispatcher,
        createdAt: new Date(now - 864e5 * (revoked ? 20 : 15)),
        revokedAt: revoked ? new Date(now - 864e5 * 16) : null,
        revokedById: revoked ? dispatcher : null,
      },
    });
  };
  await choose("IQ-21/25", "MARKETING");
  await choose("IQ-22/25", "BIZETIKA");
  await choose("BIA-80/25", "PYTHON");
  await choose("BIA-81/25", "BIGDATA", true);
  await choose("BIA-81/25", "PYTHON");

  // syllabi: approved / pending / rejected (+ resubmitted) / missing
  const reviewer = approver;
  const teacherUser = await db.tenantMembership.findFirst({
    where: { tenantId: T, teacherId: { not: null } },
  });
  const pairs = new Map<
    string,
    { subjectId: string; teacherId: string; departmentId: string; language: string }
  >();
  for (const a of await db.teachingAssignment.findMany({
    where: { tenantId: T, workloadId: { in: approved.map((w) => w.id) } },
    include: { teachers: true },
    orderBy: [{ subjectId: "asc" }, { id: "asc" }],
  }))
    for (const t of a.teachers)
      if (!pairs.has(`${a.subjectId}|${t.teacherId}`))
        pairs.set(`${a.subjectId}|${t.teacherId}`, {
          subjectId: a.subjectId,
          teacherId: t.teacherId,
          departmentId: a.departmentId,
          language: a.language,
        });
  const subjName = new Map(Object.values(subj).map((s) => [s.id, s.name]));
  const teacherName = new Map(
    (await db.teacher.findMany({ where: { tenantId: T } })).map((t) => [t.id, t.fullName]),
  );
  let k = 0;
  let syllabi = 0;
  const file = async (subjectId: string, teacherId: string, v: number) => {
    const buf = minimalPdf([
      `Syllabus (SYNTHETIC) v${v}`,
      `Subject: ${subjName.get(subjectId)}`,
      `Teacher: ${teacherName.get(teacherId)}`,
      `Academic year: ${term.academicYear.name}`,
      "Demo document generated by the AcaFlow seed. Not a real syllabus.",
    ]);
    const hash = sha(buf);
    const key = await putObject(T, hash, buf);
    return db.storedFile.create({
      data: {
        tenantId: T,
        sha256: hash,
        size: buf.length,
        mime: "application/pdf",
        originalName: `syllabus-${subj[Object.keys(subj).find((c) => subj[c].id === subjectId)!].code}-v${v}.pdf`,
        storageKey: key,
        createdById: dispatcher,
      },
    });
  };
  // deterministic order (ids are random per seed): subject code, then teacher name
  const codeOf = new Map(Object.values(subj).map((s) => [s.id, s.code]));
  const ordered = [...pairs.values()].sort(
    (a, b) =>
      (codeOf.get(a.subjectId) ?? "").localeCompare(codeOf.get(b.subjectId) ?? "") ||
      (teacherName.get(a.teacherId) ?? "").localeCompare(teacherName.get(b.teacherId) ?? ""),
  );
  for (const p of ordered) {
    const mod = k++ % 7;
    const own = teacherUser?.teacherId === p.teacherId;
    if (mod === 6 || (own && k % 2 === 0)) continue; // missing
    const uploadedById = own ? teacherUser!.userId : dispatcher;
    const base = {
      tenantId: T,
      subjectId: p.subjectId,
      teacherId: p.teacherId,
      departmentId: p.departmentId,
      academicYearId: term.academicYearId,
      language: p.language,
      uploadedById,
    };
    if (mod === 5) {
      const f1 = await file(p.subjectId, p.teacherId, 1);
      await db.syllabus.create({
        data: {
          ...base,
          version: 1,
          status: "REJECTED",
          fileId: f1.id,
          reviewedById: reviewer,
          reviewedAt: new Date(now - 864e5 * 6),
          reviewComment: "Не указаны критерии оценивания (SYNTHETIC)",
          createdAt: new Date(now - 864e5 * 8),
        },
      });
      const f2 = await file(p.subjectId, p.teacherId, 2);
      await db.syllabus.create({
        data: {
          ...base,
          version: 2,
          status: "UPLOADED",
          fileId: f2.id,
          createdAt: new Date(now - 864e5 * 2),
        },
      });
      syllabi += 2;
      continue;
    }
    const f = await file(p.subjectId, p.teacherId, 1);
    await db.syllabus.create({
      data: {
        ...base,
        version: 1,
        status: mod === 4 ? "UPLOADED" : "APPROVED",
        fileId: f.id,
        reviewedById: mod === 4 ? null : reviewer,
        reviewedAt: mod === 4 ? null : new Date(now - 864e5 * 9),
        createdAt: new Date(now - 864e5 * 12),
      },
    });
    syllabi++;
  }
  console.log("Academic seed complete (synthetic):", { curricula, syllabi });
}

if (process.argv[1]?.endsWith("seed-academic.ts")) {
  const db = new PrismaClient();
  seedAcademic(db)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
