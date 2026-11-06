// Lists translation keys used in src: static t("key", {vars}) calls and key-like string literals.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const root = new URL("../src/", import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!p.includes("i18n/messages")) walk(p); } else if (/\.(ts|tsx)$/.test(f)) files.push(p); } })(root);
export const NS = ["nav","role","status","wstatus","impstatus","ovrstatus","job","activity","week","day","rule","ruletype","v","metric","board","gen","phase","stop","core","versions","diff","approval","workloads","dir","origin","audience","rulestatus","dash","auth","login","shell","error","hk","resolve","filter","session","severity","history","theme","locale","user","notifications","common","audit","an","cons","ovr","tt","pub","cab","export","imp","wl","app","meta","sched","gen"];
const keyRe = new RegExp(`["'\`]((?:${NS.join("|")})\\.[A-Za-z0-9_.]+)["'\`]`, "g");
const out = new Map();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"([^"]+)"\s*(?:,\s*\{([^}]*)\})?/g)) {
    const vars = (m[2] ?? "").split(",").map((s) => s.split(":")[0].trim()).filter(Boolean);
    const e = out.get(m[1]) ?? { vars: new Set(), files: new Set() };
    vars.forEach((v) => e.vars.add(v)); e.files.add(relative(root, f)); out.set(m[1], e);
  }
  for (const m of src.matchAll(keyRe)) {
    if (m[1].endsWith(".")) continue;
    const e = out.get(m[1]) ?? { vars: new Set(), files: new Set() };
    e.files.add(relative(root, f)); out.set(m[1], e);
  }
}
if (process.argv[2] === "--json") console.log(JSON.stringify([...out.keys()].sort()));
else for (const [k, e] of [...out].sort()) console.log(`${k}${e.vars.size ? " {" + [...e.vars].join(",") + "}" : ""}  ← ${[...e.files].map((x) => x.replace(/^app\/\(app\)\//, "").replace(/\.tsx?$/, "")).join(",")}`);
