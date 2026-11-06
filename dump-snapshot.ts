/** Dev helper: writes a FULL snapshot of the current term to stdout path (used by solver tests/benchmarks). */
import { writeFileSync } from "node:fs";
import { prisma, tenantDb } from "../src/lib/db";
import { loadWorld } from "../src/lib/domain/world";
import { buildSnapshot } from "../src/lib/domain/snapshot";

const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: process.argv[3] ?? "tsue" } });
const db = tenantDb(t.id);
const term = await db.term.findFirstOrThrow({ where: { current: true } });
const w = await loadWorld(db, term.id);
const { snapshot } = buildSnapshot(w, {
  runId: "bench-run",
  mode: "FULL",
  search: {
    requestedVariantCount: 3,
    timeLimitSeconds: Number(process.argv[4] ?? 60),
    seed: 7,
    workers: 2,
    diversityMinChanged: 15,
    qualityTolerance: 0.3,
    candidateRooms: 6,
  },
});
writeFileSync(process.argv[2], JSON.stringify(snapshot));
console.log(`sessions=${w.sessions.size} written`);
await prisma.$disconnect();
