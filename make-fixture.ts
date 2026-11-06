/**
 * Writes the SYNTHETIC workload workbook to disk for manual import testing.
 * Usage: npm run fixtures [-- <output.xlsx>]   (default: tests/fixtures/yuklama-synthetic.xlsx, git-ignored)
 * Tests and the in-app sample download build the same workbook in memory, so no binary is committed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSyntheticWorkloadXlsx } from "../src/lib/demo/synthetic-workbook";

async function main() {
  const out = path.resolve(process.argv[2] ?? "tests/fixtures/yuklama-synthetic.xlsx");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, await buildSyntheticWorkloadXlsx());
  console.log("written", out);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
