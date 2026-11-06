/**
 * Seed for the first tenant (ТДИУ / TSUE). ALL DATA IS SYNTHETIC: names, groups, rooms and hours are
 * generated for demonstration and are NOT confirmed university data. Numbers mirror the starting
 * settings of the master prompt (§55) and live in tenant tables, not in code constants.
 *
 * Safety: the seed only INSERTS. It never deletes or truncates. If the demo tenant already exists it
 * stops. To start over on a development database use `npm run db:reset` (prisma migrate reset).
 */
import { PrismaClient, type ActivityType, type Role, type WeekPattern } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { DEFAULT_PROFILE } from "../src/lib/domain/profile";
import { convertHours } from "../src/lib/domain/conversion";
import { activeWeeks } from "../src/lib/domain/calendar";
import { seedAcademic } from "./seed-academic";
import { seedExams } from "./seed-exams";

const db = new PrismaClient();
const PASSWORD = "demo1234";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const FACULTIES = [
  { code: "IQT", name: "Iqtisodiyot fakulteti" },
  { code: "MOL", name: "Moliya va buxgalteriya fakulteti" },
  { code: "RAQ", name: "Raqamli iqtisodiyot fakulteti" },
];
const DEPARTMENTS = [
  { code: "MIKRO", fac: "IQT", name: "Mikroiqtisodiyot kafedrasi", pool: 4 },
  { code: "MAKRO", fac: "IQT", name: "Makroiqtisodiyot kafedrasi", pool: 4 },
  { code: "TIL", fac: "IQT", name: "Xorijiy tillar kafedrasi", pool: 7 },
  { code: "TARIX", fac: "IQT", name: "Ijtimoiy fanlar kafedrasi", pool: 3 },
  { code: "MOLIYA", fac: "MOL", name: "Moliya kafedrasi", pool: 4 },
  { code: "BUX", fac: "MOL", name: "Buxgalteriya hisobi va audit kafedrasi", pool: 3 },
  { code: "AT", fac: "RAQ", name: "Axborot texnologiyalari kafedrasi", pool: 4 },
  { code: "MAT", fac: "RAQ", name: "Oliy matematika kafedrasi", pool: 4 },
  { code: "RI", fac: "RAQ", name: "Raqamli iqtisodiyot kafedrasi", pool: 3 },
];
const SUBJECTS: [string, string, string, string][] = [
  ["MIKRO", "Mikroiqtisodiyot", "Mikroiqtisodiyot", "MIKRO"],
  ["IQTNAZ", "Iqtisodiyot nazariyasi", "Iqt. nazariyasi", "MIKRO"],
  ["MAKRO", "Makroiqtisodiyot", "Makroiqtisodiyot", "MAKRO"],
  ["STAT", "Statistika", "Statistika", "MAKRO"],
  ["EKONOM", "Ekonometrika", "Ekonometrika", "MAKRO"],
  ["INGLIZ", "Ingliz tili", "Ingliz tili", "TIL"],
  ["TARIX", "O‘zbekistonning eng yangi tarixi", "Yangi tarix", "TARIX"],
  ["MOLIYA", "Moliya", "Moliya", "MOLIYA"],
  ["PULBANK", "Pul va banklar", "Pul va banklar", "MOLIYA"],
  ["SOLIQ", "Soliqlar va soliqqa tortish", "Soliqlar", "MOLIYA"],
  ["BUXH", "Buxgalteriya hisobi", "Buxgalteriya", "BUX"],
  ["AT", "Axborot texnologiyalari", "AT", "AT"],
  ["DASTUR", "Dasturlash asoslari", "Dasturlash", "AT"],
  ["MBAZA", "Ma’lumotlar bazasi", "Ma’lumotlar bazasi", "AT"],
  ["OLIYMAT", "Oliy matematika", "Oliy matematika", "MAT"],
  ["RAQIQT", "Raqamli iqtisodiyot asoslari", "Raqamli iqtisodiyot", "RI"],
];

type Item = {
  s: string;
  L?: number;
  P?: number;
  LAB?: number;
  mod?: "M1" | "M2";
  split?: boolean;
  pattern?: WeekPattern;
  hours?: number;
};
const PLAN: Record<string, Item[]> = {
  IQT1: [
    { s: "MIKRO", L: 1, P: 1 },
    { s: "OLIYMAT", L: 1, P: 2 },
    { s: "TARIX", L: 1, P: 1, mod: "M1", hours: 15 },
    { s: "IQTNAZ", L: 1, P: 1, mod: "M2" },
    { s: "INGLIZ", P: 2, split: true },
    { s: "AT", L: 1, LAB: 1, split: true },
  ],
  IQT2: [
    { s: "MAKRO", L: 1, P: 1 },
    { s: "STAT", L: 1, P: 2 },
    { s: "MOLIYA", L: 1, P: 1, mod: "M1" },
    { s: "PULBANK", L: 1, P: 1, mod: "M2" },
    { s: "EKONOM", L: 1, LAB: 1, pattern: "UPPER" },
    { s: "INGLIZ", P: 1 },
  ],
  MOL1: [
    { s: "BUXH", L: 1, P: 2 },
    { s: "MIKRO", L: 1, P: 1 },
    { s: "OLIYMAT", L: 1, P: 1 },
    { s: "TARIX", L: 1, P: 1, mod: "M1", hours: 15 },
    { s: "IQTNAZ", L: 1, P: 1, mod: "M2" },
    { s: "INGLIZ", P: 2 },
  ],
  MOL2: [
    { s: "MOLIYA", L: 1, P: 2 },
    { s: "SOLIQ", L: 1, P: 1 },
    { s: "BUXH", L: 1, P: 1 },
    { s: "STAT", L: 1, P: 1 },
    { s: "INGLIZ", P: 1 },
  ],
  RAQ1: [
    { s: "OLIYMAT", L: 1, P: 2 },
    { s: "DASTUR", L: 1, LAB: 2, split: true },
    { s: "INGLIZ", P: 2, split: true },
    { s: "TARIX", L: 1, P: 1, mod: "M1", hours: 15 },
    { s: "RAQIQT", L: 1, P: 1, mod: "M2" },
  ],
  RAQ2: [
    { s: "MBAZA", L: 1, LAB: 2, split: true },
    { s: "EKONOM", L: 1, P: 1 },
    { s: "STAT", L: 1, P: 1 },
    { s: "MAKRO", L: 1, P: 1 },
    { s: "INGLIZ", P: 1 },
  ],
  EVE: [
    { s: "MIKRO", L: 1, P: 1 },
    { s: "OLIYMAT", L: 1, P: 1 },
    { s: "INGLIZ", P: 1 },
  ],
};

// code, faculty, program, course, form, lang, size, shift, plan, stream, subgroups
const GROUPS: [
  string,
  string,
  string,
  number,
  string,
  string,
  number,
  string,
  string,
  string | null,
  boolean,
][] = [
  ["IQ-11/26", "IQT", "IQ", 1, "KUNDUZGI", "uz", 28, "1", "IQT1", "S-IQ1", true],
  ["IQ-12/26", "IQT", "IQ", 1, "KUNDUZGI", "uz", 27, "1", "IQT1", "S-IQ1", true],
  ["IQ-13/26", "IQT", "IQ", 1, "KUNDUZGI", "uz", 26, "1", "IQT1", "S-IQ1", false],
  ["BB-11/26i", "IQT", "BB", 1, "KUNDUZGI", "en", 22, "1", "IQT1", null, false],
  ["IQ-21/25", "IQT", "IQ", 2, "KUNDUZGI", "uz", 29, "2", "IQT2", "S-IQ2", false],
  ["IQ-22/25", "IQT", "IQ", 2, "KUNDUZGI", "uz", 27, "2", "IQT2", "S-IQ2", false],
  ["MF-11/26", "MOL", "MF", 1, "KUNDUZGI", "uz", 30, "1", "MOL1", "S-MF1", false],
  ["MF-12/26", "MOL", "MF", 1, "KUNDUZGI", "uz", 28, "1", "MOL1", "S-MF1", false],
  ["MF-13/26r", "MOL", "MF", 1, "KUNDUZGI", "ru", 24, "1", "MOL1", null, false],
  ["BH-11/26", "MOL", "BH", 1, "KUNDUZGI", "uz", 27, "2", "MOL1", "S-BH1", false],
  ["BH-12/26", "MOL", "BH", 1, "KUNDUZGI", "uz", 25, "2", "MOL1", "S-BH1", false],
  ["MF-21/25", "MOL", "MF", 2, "KUNDUZGI", "uz", 29, "2", "MOL2", null, false],
  ["RI-11/26", "RAQ", "RI", 1, "KUNDUZGI", "uz", 26, "1", "RAQ1", "S-RI1", true],
  ["RI-12/26", "RAQ", "RI", 1, "KUNDUZGI", "uz", 25, "1", "RAQ1", "S-RI1", true],
  ["BIA-80/25", "RAQ", "BI", 2, "KUNDUZGI", "uz", 26, "2", "RAQ2", "S-BIA", true],
  ["BIA-81/25", "RAQ", "BI", 2, "KUNDUZGI", "uz", 24, "2", "RAQ2", "S-BIA", true],
  ["RI-21/25i", "RAQ", "RI", 2, "KUNDUZGI", "en", 20, "2", "RAQ2", null, true],
  ["IQ-K1/26", "IQT", "IQK", 1, "KECHKI", "uz", 23, "K", "EVE", null, false],
];
const HOME: Record<string, string> = { IQT: "A", MOL: "B", RAQ: "C" };

const SURN = [
  "Karimov",
  "Rahimova",
  "Yusupov",
  "Toshmatov",
  "Abdullayeva",
  "Ismoilov",
  "Nazarova",
  "Xolmatov",
  "Saidov",
  "Qodirova",
  "Ergashev",
  "Mirzayeva",
  "Usmonov",
  "Jo‘rayev",
  "Rasulova",
  "Aliyev",
  "Hamidova",
  "Sobirov",
  "Tursunova",
  "Normatov",
  "Ahmedov",
  "Yo‘ldosheva",
  "Murodov",
  "Islomova",
  "Sharipov",
  "Valiyeva",
  "Raximov",
  "Fayzullayeva",
  "Bakirov",
  "Zokirova",
  "G‘aniyev",
  "Olimova",
  "Hasanov",
  "Qosimova",
  "Nurmatov",
  "Ibragimova",
  "Sultonov",
  "Mahmudova",
];
const MALE = [
  "Akmal",
  "Bobur",
  "Jasur",
  "Sardor",
  "Otabek",
  "Rustam",
  "Dilshod",
  "Sherzod",
  "Anvar",
  "Farrux",
  "Ulug‘bek",
  "Jamshid",
  "Nodir",
  "Bekzod",
  "Sanjar",
  "Alisher",
  "Botir",
  "Mansur",
];
const FEMALE = [
  "Dilnoza",
  "Nigora",
  "Gulnora",
  "Malika",
  "Shahnoza",
  "Feruza",
  "Kamola",
  "Madina",
  "Zarina",
  "Nodira",
  "Sevara",
  "Mohira",
  "Laylo",
  "Barno",
  "Umida",
  "Iroda",
  "Nilufar",
  "Yulduz",
];
const PATR = [
  "Rustam",
  "Akmal",
  "Bahodir",
  "Shavkat",
  "Erkin",
  "Anvar",
  "Hamid",
  "Ilhom",
  "Karim",
  "Olim",
  "Rashid",
  "Tohir",
];

const CYR: Record<string, string> = {
  a: "а",
  b: "б",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "ҳ",
  i: "и",
  j: "ж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "қ",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  x: "х",
  y: "й",
  z: "з",
};
const toCyr = (s: string) =>
  s
    .replace(/o‘/gi, "ў")
    .replace(/g‘/gi, "ғ")
    .replace(/sh/gi, "ш")
    .replace(/ch/gi, "ч")
    .replace(/yo/gi, "ё")
    .replace(/yu/gi, "ю")
    .replace(/ya/gi, "я")
    .replace(/‘|’/g, "ъ")
    .split("")
    .map((c) => {
      const l = c.toLowerCase();
      const r = CYR[l];
      return r ? (c === l ? r : r.toUpperCase()) : c;
    })
    .join("");

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    console.error("Refusing to seed synthetic demo data in production (set ALLOW_DEMO_SEED=1 to override).");
    process.exit(1);
  }
  if (await db.tenant.findUnique({ where: { slug: "tsue" } })) {
    console.log(
      "Demo tenant 'tsue' already exists — nothing to do. Use `npm run db:reset` on a dev database to start over.",
    );
    return;
  }

  const tenant = await db.tenant.create({
    data: {
      slug: "tsue",
      name: "Toshkent davlat iqtisodiyot universiteti",
      shortName: "TDIU",
      timezone: "Asia/Tashkent",
      defaultLocale: "ru",
      publicMode: "PUBLIC",
    },
  });
  const T = tenant.id;
  const year = await db.academicYear.create({
    data: {
      tenantId: T,
      name: "2026/2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
    },
  });
  const term = await db.term.create({
    data: {
      tenantId: T,
      academicYearId: year.id,
      name: "Kuzgi semestr 2026",
      startDate: new Date("2026-09-07"),
      weeks: 16,
      weekAnchorDate: new Date("2026-09-07"),
      current: true,
    },
  });
  await db.module.createMany({
    data: [
      { tenantId: T, termId: term.id, code: "M1", name: "1-modul", weekFrom: 1, weekTo: 8 },
      { tenantId: T, termId: term.id, code: "M2", name: "2-modul", weekFrom: 9, weekTo: 16 },
    ],
  });
  const cfg = await db.timeSlotConfig.create({
    data: {
      tenantId: T,
      name: "TDIU 2026 (80 daqiqa)",
      effectiveFrom: new Date("2026-08-01"),
      sessionMinutes: 80,
      daysPerWeek: 5,
    },
  });
  const times = [
    [8, 0],
    [9, 30],
    [11, 0],
    [13, 0],
    [15, 0],
    [16, 30],
    [18, 0],
    [19, 30],
  ];
  await db.timeSlot.createMany({
    data: times.map(([h, m], i) => ({
      tenantId: T,
      configId: cfg.id,
      number: i + 1,
      startMin: h * 60 + m,
      endMin: h * 60 + m + 80,
    })),
  });
  const shifts = await Promise.all([
    db.shift.create({ data: { tenantId: T, code: "1", name: "1-smena", slotFrom: 1, slotTo: 4 } }),
    db.shift.create({ data: { tenantId: T, code: "2", name: "2-smena", slotFrom: 4, slotTo: 7 } }),
    db.shift.create({ data: { tenantId: T, code: "K", name: "Kechki", slotFrom: 6, slotTo: 8 } }),
  ]);
  const shiftId = Object.fromEntries(shifts.map((s) => [s.code, s.id]));

  const levels = await Promise.all(
    [
      ["BAKALAVR", "Bakalavriat"],
      ["MAGISTR", "Magistratura"],
    ].map(([code, name]) => db.educationLevel.create({ data: { tenantId: T, code, name } })),
  );
  const forms = await Promise.all(
    [
      ["KUNDUZGI", "Kunduzgi"],
      ["KECHKI", "Kechki"],
      ["SIRTQI", "Sirtqi"],
      ["MASOFAVIY", "Masofaviy"],
      ["IKKINCHI_OLIY", "Ikkinchi oliy"],
    ].map(([code, name]) => db.educationForm.create({ data: { tenantId: T, code, name } })),
  );
  const kinds = await Promise.all(
    [
      ["STANDARD", "Standart"],
      ["SECOND_DEGREE", "Ikkinchi oliy ta’lim"],
      ["JOINT", "Qo‘shma dastur"],
    ].map(([code, name]) => db.programKind.create({ data: { tenantId: T, code, name } })),
  );
  await db.studyLanguage.createMany({
    data: [
      ["uz", "O‘zbek"],
      ["ru", "Rus"],
      ["en", "Ingliz"],
    ].map(([code, name]) => ({ tenantId: T, code, name })),
  });
  const formId = Object.fromEntries(forms.map((f) => [f.code, f.id]));

  const fac: Record<string, string> = {};
  for (const f of FACULTIES) fac[f.code] = (await db.faculty.create({ data: { tenantId: T, ...f } })).id;
  const dep: Record<string, string> = {};
  for (const d of DEPARTMENTS)
    dep[d.code] = (
      await db.department.create({ data: { tenantId: T, code: d.code, name: d.name, facultyId: fac[d.fac] } })
    ).id;
  const PROGRAMS = [
    ["IQ", "IQT", "Iqtisodiyot (tarmoqlar bo‘yicha)", "KUNDUZGI"],
    ["IQK", "IQT", "Iqtisodiyot (kechki)", "KECHKI"],
    ["BB", "IQT", "Biznes boshqaruvi", "KUNDUZGI"],
    ["MF", "MOL", "Moliya va moliyaviy texnologiyalar", "KUNDUZGI"],
    ["BH", "MOL", "Buxgalteriya hisobi", "KUNDUZGI"],
    ["RI", "RAQ", "Raqamli iqtisodiyot", "KUNDUZGI"],
    ["BI", "RAQ", "Biznes-informatika", "KUNDUZGI"],
  ];
  const prog: Record<string, string> = {};
  for (const [code, f, name, form] of PROGRAMS)
    prog[code] = (
      await db.program.create({
        data: {
          tenantId: T,
          code,
          name,
          facultyId: fac[f],
          levelId: levels[0].id,
          formId: formId[form],
          kindId: kinds[0].id,
        },
      })
    ).id;

  // Facilities
  const types = Object.fromEntries(
    await Promise.all(
      [
        ["LECTURE", "Ma’ruza zali"],
        ["SEMINAR", "Seminar xonasi"],
        ["COMPUTER", "Kompyuter sinfi"],
        ["LAB", "Laboratoriya"],
        ["CONFERENCE", "Konferens-zal"],
      ].map(async ([code, name]) => [
        code,
        (await db.roomType.create({ data: { tenantId: T, code, name } })).id,
      ]),
    ),
  );
  const bld: Record<string, string> = {};
  for (const [code, name, address] of [
    ["A", "Asosiy bino", "Islom Karimov ko‘chasi, 49"],
    ["B", "B bino", "Islom Karimov ko‘chasi, 49B"],
    ["C", "Raqamli texnologiyalar markazi", "Islom Karimov ko‘chasi, 51"],
  ])
    bld[code] = (await db.building.create({ data: { tenantId: T, code, name, address } })).id;
  const travel = [];
  for (const a of Object.keys(bld))
    for (const b of Object.keys(bld))
      if (a !== b) travel.push({ tenantId: T, fromBuildingId: bld[a], toBuildingId: bld[b], minutes: 35 });
  await db.travelTime.createMany({ data: travel });
  const ROOMS: [string, string, number, string, string | null, string[]][] = [
    ["A", "101", 150, "LECTURE", null, ["projector", "sound"]],
    ["A", "102", 120, "LECTURE", null, ["projector", "sound"]],
    ["A", "201", 100, "LECTURE", null, ["projector"]],
    ["A", "301", 220, "CONFERENCE", null, ["projector", "sound"]],
    ["B", "101", 120, "LECTURE", null, ["projector", "sound"]],
    ["C", "101", 90, "LECTURE", null, ["projector"]],
    ["C", "301", 18, "COMPUTER", "RAQ", ["computers"]],
    ["C", "302", 18, "COMPUTER", "RAQ", ["computers"]],
    ["C", "303", 30, "COMPUTER", "RAQ", ["computers", "projector"]],
    ["C", "304", 30, "COMPUTER", null, ["computers", "projector"]],
  ];
  for (let i = 0; i < 8; i++)
    ROOMS.push(["A", String(202 + i), i % 3 === 0 ? 35 : 32, "SEMINAR", "IQT", i % 2 ? [] : ["projector"]]);
  for (let i = 0; i < 7; i++)
    ROOMS.push(["B", String(201 + i), i % 2 ? 32 : 30, "SEMINAR", "MOL", i % 2 ? ["projector"] : []]);
  for (let i = 0; i < 4; i++) ROOMS.push(["C", String(201 + i), 30, "SEMINAR", "RAQ", ["projector"]]);
  for (const [b, num, cap, type, owner, eq] of ROOMS)
    await db.room.create({
      data: {
        tenantId: T,
        buildingId: bld[b],
        roomNumber: num,
        nominalCapacity: cap,
        approvedMaximumCapacity: cap,
        roomTypeId: types[type],
        ownerFacultyId: owner ? fac[owner] : null,
        equipment: eq,
        floor: Number(num[0]),
      },
    });

  // Teachers (synthetic names)
  const teachers: { id: string; dep: string; langs: string[]; load: number; name: string }[] = [];
  let si = 0;
  for (const d of DEPARTMENTS)
    for (let k = 0; k < d.pool; k++) {
      const surname = SURN[si % SURN.length];
      const female = surname.endsWith("a");
      const first = (female ? FEMALE : MALE)[(si * 7) % 18];
      const patr = PATR[(si * 5) % PATR.length] + (female ? "ovna" : "ovich");
      si++;
      const fullName = `${surname} ${first} ${patr}`;
      const langs =
        d.code === "TIL"
          ? ["uz", "en", "ru"]
          : k === 0
            ? ["uz", "ru", "en"]
            : k === 1
              ? ["uz", "ru"]
              : ["uz"];
      const short = `${surname} ${first[0]}.${patr[0]}.`;
      const t = await db.teacher.create({
        data: {
          tenantId: T,
          fullName,
          nameVariants: [short, `${first[0]}.${patr[0]}. ${surname}`, toCyr(short)],
          primaryDepartmentId: dep[d.code],
          position: k === 0 ? "Professor" : k === 1 ? "Dotsent" : "Katta o‘qituvchi",
          degree: k === 0 ? "i.f.d." : k === 1 ? "i.f.n." : null,
          rate: k === 0 ? 1 : k === 1 ? 1 : 0.75,
          languages: langs,
          departments: { create: [{ departmentId: dep[d.code] }] },
        },
      });
      teachers.push({ id: t.id, dep: d.code, langs, load: 0, name: fullName });
    }
  // One teacher works in two departments (not a duplicate).
  await db.teacherDepartment.create({
    data: { teacherId: teachers.find((t) => t.dep === "MAKRO")!.id, departmentId: dep.MIKRO },
  });
  const pick = (depCode: string, lang: string, n: number, lecturer: boolean) => {
    const pool = teachers.filter((t) => t.dep === depCode && t.langs.includes(lang));
    const cands = lecturer ? pool.slice(0, 2) : pool;
    const t = cands.sort((a, b) => a.load - b.load || a.name.localeCompare(b.name))[0];
    t.load += n;
    return t.id;
  };

  // Groups, subgroups, streams, audience sets
  const groupRec: Record<
    string,
    {
      id: string;
      code: string;
      lang: string;
      plan: string;
      stream: string | null;
      size: number;
      subgroups: { id: string; code: string }[];
    }
  > = {};
  for (const [code, f, p, course, form, lang, size, sh, plan, stream, split] of GROUPS) {
    const slug = code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const g = await db.studentGroup.create({
      data: {
        tenantId: T,
        code,
        facultyId: fac[f],
        programId: prog[p],
        courseYear: course,
        formId: formId[form],
        languageCode: lang,
        studentCount: size,
        shiftId: shiftId[sh],
        homeBuildingId: bld[HOME[f]],
        slug,
        tutor: null,
      },
    });
    const subs = [];
    if (split)
      for (const [c, n] of [
        ["1", Math.ceil(size / 2)],
        ["2", Math.floor(size / 2)],
      ] as const)
        subs.push(
          await db.subgroup.create({
            data: { tenantId: T, groupId: g.id, code: c, partition: "til-lab", studentCount: n },
          }),
        );
    groupRec[code] = {
      id: g.id,
      code,
      lang,
      plan,
      stream,
      size,
      subgroups: subs.map((s) => ({ id: s.id, code: s.code })),
    };
  }
  const streamRec: Record<string, { id: string; groups: string[] }> = {};
  for (const sc of [...new Set(GROUPS.map((g) => g[9]).filter(Boolean))] as string[]) {
    const members = GROUPS.filter((g) => g[9] === sc).map((g) => g[0]);
    const s = await db.stream.create({
      data: {
        tenantId: T,
        code: sc,
        name: `${sc} (${members.join(", ")})`,
        termId: term.id,
        groups: { create: members.map((m) => ({ groupId: groupRec[m].id })) },
      },
    });
    streamRec[sc] = { id: s.id, groups: members };
  }
  const audCache = new Map<string, string>();
  const audience = async (kind: "GROUP" | "SUBGROUP" | "STREAM", refId: string, label: string) => {
    const k = `${kind}:${refId}`;
    if (!audCache.has(k))
      audCache.set(
        k,
        (
          await db.audienceSet.create({
            data: {
              tenantId: T,
              kind,
              label,
              groupId: kind === "GROUP" ? refId : null,
              subgroupId: kind === "SUBGROUP" ? refId : null,
              streamId: kind === "STREAM" ? refId : null,
            },
          })
        ).id,
      );
    return audCache.get(k)!;
  };

  const subj: Record<string, string> = {};
  for (const [code, name, short, d] of SUBJECTS)
    subj[code] = (
      await db.subject.create({ data: { tenantId: T, code, name, shortName: short, departmentId: dep[d] } })
    ).id;
  const subjDep = Object.fromEntries(SUBJECTS.map(([c, , , d]) => [c, d]));

  // Conversion rule — SYNTHETIC seed value, must be confirmed by the university (Appendix D).
  const rule = await db.hourConversionRule.create({
    data: {
      tenantId: T,
      name: "Akademik soat → juftlik (SYNTHETIC SEED)",
      sourceUnit: "ACADEMIC_HOUR",
      sourceUnitMinutes: 40,
      sessionMinutes: 80,
      roundingMode: "CEIL",
      effectiveFrom: new Date("2026-08-01"),
      status: "APPROVED",
      note: "Demo-qiymat: 1 akademik soat = 40 daqiqa. Universitet tasdiqlashi kerak.",
    },
  });

  const wf = await db.approvalWorkflow.create({
    data: {
      tenantId: T,
      code: "WORKLOAD",
      name: "Kafedra yuklamasini tasdiqlash",
      version: 1,
      steps: {
        create: (
          [
            ["DEPARTMENT_HEAD", "Kafedra mudiri"],
            ["DEAN", "Dekan"],
            ["HEAD_ACADEMIC_SECTION", "Akademik bo‘lim boshlig‘i"],
            ["HEAD_ACADEMIC_DEPARTMENT", "Akademik departament boshlig‘i"],
            ["VICE_RECTOR", "Prorektor"],
          ] as [Role, string][]
        ).map(([role, label], i) => ({ tenantId: T, order: i + 1, role, label })),
      },
    },
    include: { steps: true },
  });
  await db.approvalWorkflow.create({
    data: {
      tenantId: T,
      code: "SCHEDULE",
      name: "Jadvalni tasdiqlash",
      version: 1,
      steps: {
        create: [
          { tenantId: T, order: 1, role: "HEAD_ACADEMIC_SECTION", label: "Akademik bo‘lim boshlig‘i" },
        ],
      },
    },
  });

  const workloads: Record<string, string> = {};
  for (const d of DEPARTMENTS)
    workloads[d.code] = (
      await db.workload.create({
        data: {
          tenantId: T,
          departmentId: dep[d.code],
          termId: term.id,
          workflowId: wf.id,
          workflowVersion: 1,
        },
      })
    ).id;

  const lectureSessions = new Map<string, string[]>();
  const practiceSessions: { key: string; ids: string[] }[] = [];
  const mkAssignment = async (o: {
    subject: string;
    activity: ActivityType;
    audienceId: string;
    perWeek: number;
    mod?: "M1" | "M2";
    pattern?: WeekPattern;
    lang: string;
    teacher: string;
    hours?: number;
    roomType: string;
    equipment?: string[];
  }) => {
    const [wf0, wt] = o.mod === "M1" ? [1, 8] : o.mod === "M2" ? [9, 16] : [1, 16];
    const weeks = activeWeeks(wf0, wt, o.pattern ?? "ALL", 1).length;
    const raw = o.hours ?? o.perWeek * weeks * 2;
    const conv = convertHours({
      rawHours: raw,
      sourceUnitMinutes: rule.sourceUnitMinutes,
      sessionMinutes: rule.sessionMinutes,
      roundingMode: "CEIL",
    });
    const a = await db.teachingAssignment.create({
      data: {
        tenantId: T,
        workloadId: workloads[subjDep[o.subject]],
        termId: term.id,
        moduleCode: o.mod ?? null,
        departmentId: dep[subjDep[o.subject]],
        subjectId: subj[o.subject],
        audienceSetId: o.audienceId,
        activityType: o.activity,
        rawHours: raw,
        conversionRuleId: rule.id,
        calculatedSessionCount: conv.calculatedSessionCount,
        minuteDelta: conv.minuteDelta,
        sessionsPerWeek: o.perWeek,
        weekFrom: wf0,
        weekTo: wt,
        weekPattern: o.pattern ?? "ALL",
        language: o.lang,
        roomTypeCode: o.roomType,
        requiredEquipment: o.equipment ?? [],
        teachers: { create: [{ teacherId: o.teacher, role: "PRIMARY" }] },
      },
    });
    const ids: string[] = [];
    for (let k = 1; k <= o.perWeek; k++)
      ids.push(
        (
          await db.teachingSession.create({
            data: { tenantId: T, assignmentId: a.id, ordinal: k, durationMinutes: 80 },
          })
        ).id,
      );
    return ids;
  };

  const doneStreamLectures = new Set<string>();
  for (const g of Object.values(groupRec)) {
    for (const it of PLAN[g.plan]) {
      if (it.L) {
        const streamKey = g.stream ? `${g.stream}|${it.s}` : `${g.code}|${it.s}`;
        if (!doneStreamLectures.has(streamKey)) {
          doneStreamLectures.add(streamKey);
          const aud = g.stream
            ? await audience("STREAM", streamRec[g.stream].id, g.stream)
            : await audience("GROUP", g.id, g.code);
          const members = g.stream ? streamRec[g.stream].groups : [g.code];
          const ids = await mkAssignment({
            subject: it.s,
            activity: "LECTURE",
            audienceId: aud,
            perWeek: it.L,
            mod: it.mod,
            lang: g.lang,
            teacher: pick(subjDep[it.s], g.lang, it.L, true),
            hours: it.hours,
            roomType: members.length > 1 ? "LECTURE" : "SEMINAR",
          });
          for (const mc of members) lectureSessions.set(`${it.s}|${mc}`, ids);
        }
      }
      const prac = async (n: number, activity: ActivityType, roomType: string, equipment?: string[]) => {
        const targets =
          it.split && g.subgroups.length
            ? g.subgroups.map((s) => ({ kind: "SUBGROUP" as const, id: s.id, label: `${g.code}/${s.code}` }))
            : [{ kind: "GROUP" as const, id: g.id, label: g.code }];
        for (const tg of targets) {
          const aud = await audience(tg.kind, tg.id, tg.label);
          const ids = await mkAssignment({
            subject: it.s,
            activity,
            audienceId: aud,
            perWeek: n,
            mod: it.mod,
            pattern: it.pattern,
            lang: g.lang,
            teacher: pick(subjDep[it.s], g.lang, n, false),
            roomType,
            equipment,
          });
          practiceSessions.push({ key: `${it.s}|${g.code}`, ids });
        }
      };
      if (it.P) await prac(it.P, it.s === "INGLIZ" ? "PRACTICE" : "SEMINAR", "SEMINAR");
      if (it.LAB) await prac(it.LAB, "LAB", "COMPUTER", ["computers"]);
    }
  }
  // Lecture → practice dependency (first lecture of the week precedes the first practice), explicit rows.
  for (const p of practiceSessions) {
    const lec = lectureSessions.get(p.key);
    if (lec?.length)
      await db.sessionDependency.create({
        data: { tenantId: T, predecessorId: lec[0], successorId: p.ids[0], minGapMinutes: 0 },
      });
  }

  // Availability (synthetic): external employment, preferences
  const tAt = (dc: string, i: number) => teachers.filter((t) => t.dep === dc)[i].id;
  const av: {
    ownerId: string;
    day: number;
    slot: number;
    kind: "HARD_UNAVAILABLE" | "SOFT_UNAVAILABLE";
    reason: string;
  }[] = [];
  for (const s of [1, 2, 3])
    for (const d of [2, 4])
      av.push({
        ownerId: tAt("MAKRO", 2),
        day: d,
        slot: s,
        kind: "HARD_UNAVAILABLE",
        reason: "Tashqi ish joyi (synthetic)",
      });
  for (const s of [1, 2, 3, 4, 5, 6, 7, 8])
    av.push({
      ownerId: tAt("AT", 3),
      day: 5,
      slot: s,
      kind: "HARD_UNAVAILABLE",
      reason: "Taklif etilgan o‘qituvchi: juma band",
    });
  for (const d of [1, 2, 3, 4, 5])
    av.push({
      ownerId: tAt("MOLIYA", 0),
      day: d,
      slot: 1,
      kind: "SOFT_UNAVAILABLE",
      reason: "Erta parani istamaydi",
    });
  for (const d of [1, 3])
    av.push({
      ownerId: tAt("TIL", 1),
      day: d,
      slot: 4,
      kind: "SOFT_UNAVAILABLE",
      reason: "Kafedra yig‘ilishi",
    });
  await db.availability.createMany({ data: av.map((a) => ({ tenantId: T, ownerType: "TEACHER", ...a })) });

  // Workload approvals: all departments approved except RI (in approval at the dean step).
  const now = Date.now();
  for (const d of DEPARTMENTS) {
    const id = workloads[d.code];
    const assignments = await db.teachingAssignment.findMany({
      where: { workloadId: id },
      include: { teachers: true },
      orderBy: { id: "asc" },
    });
    const payload = JSON.stringify(
      assignments.map((a) => ({
        id: a.id,
        subjectId: a.subjectId,
        audienceSetId: a.audienceSetId,
        activityType: a.activityType,
        rawHours: a.rawHours.toString(),
        sessionsPerWeek: a.sessionsPerWeek,
        weekFrom: a.weekFrom,
        weekTo: a.weekTo,
        weekPattern: a.weekPattern,
        teachers: a.teachers.map((t) => [t.teacherId, t.role]),
      })),
    );
    const hash = sha(payload);
    const signed = d.code === "RI" ? 1 : 5;
    await db.workload.update({
      where: { id },
      data: {
        status: d.code === "RI" ? "IN_APPROVAL" : "APPROVED",
        snapshotHash: hash,
        frozenPayload: JSON.parse(payload),
        submittedAt: new Date(now - 864e5 * 20),
        approvedAt: d.code === "RI" ? null : new Date(now - 864e5 * 10),
        currentStep: d.code === "RI" ? 2 : null,
      },
    });
    await db.approvalAction.create({
      data: {
        tenantId: T,
        workloadId: id,
        action: "SUBMIT",
        actorUserId: "seed",
        actorName: "Seed (synthetic)",
        actingRole: "DEPARTMENT_ADMIN",
        scopeType: "DEPARTMENT",
        payloadHash: hash,
        createdAt: new Date(now - 864e5 * 20),
      },
    });
    for (let s = 1; s <= signed; s++)
      await db.approvalAction.create({
        data: {
          tenantId: T,
          workloadId: id,
          stepOrder: s,
          action: "SIGN",
          actorUserId: "seed",
          actorName: "Seed (synthetic)",
          actingRole: wf.steps.find((x) => x.order === s)!.role,
          scopeType: s <= 2 ? (s === 1 ? "DEPARTMENT" : "FACULTY") : "TENANT",
          payloadHash: hash,
          createdAt: new Date(now - 864e5 * (19 - s)),
        },
      });
  }

  const profile = await db.constraintProfile.create({ data: { tenantId: T, name: "Standart profil" } });
  await db.constraintProfileVersion.create({
    data: { tenantId: T, profileId: profile.id, version: 1, rules: DEFAULT_PROFILE },
  });
  await db.calendarEvent.createMany({
    data: [
      {
        tenantId: T,
        typeCode: "HOLIDAY",
        title: "Konstitutsiya kuni",
        dateFrom: new Date("2026-12-08"),
        dateTo: new Date("2026-12-08"),
      },
      {
        tenantId: T,
        typeCode: "CONFERENCE",
        title: "Ilmiy-amaliy konferensiya (RAQ)",
        dateFrom: new Date("2026-11-20"),
        dateTo: new Date("2026-11-20"),
        scope: { type: "FACULTY", ids: [fac.RAQ] },
        effect: "EXCLUDE",
      },
    ],
  });

  // Users (synthetic accounts, password demo1234)
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mkUser = async (
    email: string,
    name: string,
    roles: {
      role: Role;
      scopeType?: "TENANT" | "FACULTY" | "DEPARTMENT" | "SELF";
      facultyId?: string;
      departmentId?: string;
    }[],
    teacherId?: string,
    tenantId = T,
  ) => {
    const u = await db.user.create({ data: { email, name, passwordHash: hash } });
    await db.tenantMembership.create({
      data: {
        tenantId,
        userId: u.id,
        teacherId,
        roles: {
          create: roles.map((r) => ({
            tenantId,
            role: r.role,
            scopeType: r.scopeType ?? "TENANT",
            facultyId: r.facultyId,
            departmentId: r.departmentId,
          })),
        },
      },
    });
  };
  await mkUser("dispatcher@tsue.demo", "Dilnoza Rahimova", [{ role: "DISPATCHER" }]);
  await mkUser("akademik@tsue.demo", "Bahodir Yusupov", [{ role: "HEAD_ACADEMIC_SECTION" }]);
  await mkUser("departament@tsue.demo", "Malika Nazarova", [{ role: "HEAD_ACADEMIC_DEPARTMENT" }]);
  await mkUser("prorektor@tsue.demo", "Shavkat Ergashev", [{ role: "VICE_RECTOR" }]);
  await mkUser("dekan.raq@tsue.demo", "Anvar Saidov", [
    { role: "DEAN", scopeType: "FACULTY", facultyId: fac.RAQ },
  ]);
  await mkUser("kafedra.ri@tsue.demo", "Feruza Qodirova", [
    { role: "DEPARTMENT_HEAD", scopeType: "DEPARTMENT", departmentId: dep.RI },
  ]);
  // Prepares and submits the department workload; the head signs it (separation of duties, D-05).
  await mkUser("metodist.ri@tsue.demo", "Sevara Tursunova", [
    { role: "DEPARTMENT_ADMIN", scopeType: "DEPARTMENT", departmentId: dep.RI },
  ]);
  const teacherUser = teachers.find((t) => t.dep === "MIKRO")!;
  await mkUser(
    "teacher@tsue.demo",
    teacherUser.name,
    [{ role: "TEACHER", scopeType: "SELF" }],
    teacherUser.id,
  );
  // A pending absence request (§25): reviewed by the dispatcher; the timetable itself does not change.
  await db.absenceRequest.create({
    data: {
      tenantId: T,
      teacherId: teachers.find((t) => t.dep === "RI")!.id,
      dateFrom: new Date("2026-11-26"),
      dateTo: new Date("2026-11-27"),
      reason: "Malaka oshirish kursi (sintetik maʼlumot)",
    },
  });

  // Second tenant — proves isolation in tests; never visible to TDIU users.
  const t2 = await db.tenant.create({
    data: { slug: "demo-uni", name: "Demo University", shortName: "DEMO", publicMode: "PRIVATE" },
  });
  const f2 = await db.faculty.create({
    data: { tenantId: t2.id, code: "ECO", name: "Economics (tenant 2)" },
  });
  await db.department.create({
    data: { tenantId: t2.id, code: "MIKRO", name: "Tenant-2 Micro", facultyId: f2.id },
  });
  await mkUser("admin@demo-uni.test", "Tenant Two Admin", [{ role: "DISPATCHER" }], undefined, t2.id);

  const counts = {
    teachers: teachers.length,
    groups: GROUPS.length,
    sessions: await db.teachingSession.count({ where: { tenantId: T } }),
    rooms: ROOMS.length,
  };
  console.log("Seed complete (synthetic data):", counts);
  await seedAcademic(db);
  await seedExams(db);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
