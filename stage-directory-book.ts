/** Stage one reviewed extraction; never writes live groups or streams. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { putObject } from "../src/lib/import/storage";
import { audit } from "../src/lib/audit";
import { prisma, tenantDb } from "../src/lib/db";

async function main() {
  const [sourcePath, extractPath, tenantSlug, mode] = process.argv.slice(2);
  if (!sourcePath || !extractPath || !tenantSlug || mode !== "--apply")
    throw Error("Usage: stage-directory-book <source.docx> <extract.json> <tenant-slug> --apply");
  const source = await readFile(sourcePath);
  const extracted = JSON.parse(await readFile(extractPath, "utf8"));
  const sha = createHash("sha256").update(source).digest("hex");
  if (extracted.source_sha256 !== sha) throw Error("Source hash mismatch");
  if (
    !Array.isArray(extracted.records) ||
    !Array.isArray(extracted.streams) ||
    extracted.records.length === 0
  )
    throw Error("Invalid extraction");
  const ids = new Set(extracted.records.map((r: { id: string }) => r.id));
  if (ids.size !== extracted.records.length) throw Error("Duplicate record IDs");
  const streams = new Set(extracted.streams.map((s: { id: string }) => s.id));
  if (
    streams.size !== extracted.streams.length ||
    extracted.streams.some(
      (s: { groups: string[] }) => !Array.isArray(s.groups) || s.groups.some((id) => !ids.has(id)),
    )
  )
    throw Error("Invalid stream membership");
  if (
    extracted.records.some((r: { general_stream: string | null; specialty_stream: string | null }) =>
      [r.general_stream, r.specialty_stream].some((x) => x && !streams.has(x)),
    )
  )
    throw Error("Invalid stream reference");
  const global = prisma;
  const tenant = await global.tenant.findFirst({ where: { slug: tenantSlug } });
  if (!tenant) throw Error("Unknown tenant");
  const db = tenantDb(tenant.id);
  const existing = await db.directoryBookImport.findFirst({ where: { sourceSha256: sha } });
  if (existing) {
    console.log("ALREADY_STAGED", existing.id);
    await global.$disconnect();
    return;
  }
  const key = await putObject(tenant.id, sha, source);
  const created = await db.$transaction(async (tx) => {
    const record = await tx.directoryBookImport.create({
      data: {
        tenantId: tenant.id,
        sourceName: extracted.source_filename,
        sourceSha256: sha,
        sourceStorageKey: key,
        status: "NEEDS_REVIEW",
        payload: extracted,
      },
    });
    await audit(
      tx,
      { system: "AcaFlow source staging", tenantId: tenant.id },
      {
        action: "DIRECTORY_BOOK_STAGED",
        entityType: "DirectoryBookImport",
        entityId: record.id,
        after: {
          sourceSha256: sha,
          groupRows: extracted.records.length,
          streamRows: extracted.streams.length,
          status: record.status,
        },
      },
    );
    return record;
  });
  console.log(
    JSON.stringify({
      id: created.id,
      groupRows: extracted.records.length,
      streamRows: extracted.streams.length,
      status: created.status,
    }),
  );
  await global.$disconnect();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
