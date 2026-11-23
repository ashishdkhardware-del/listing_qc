// Register review folders in Supabase from a local tree laid out as  <root>/<folder>/<item id>/<images>
// (plus an optional <folder>/_items.csv with columns id, title, ... for titles and extra details).
// New items are added as pending; existing items keep their review status, only titles/images are refreshed.
//   node scripts/sync.mjs [root]            default root: public/folders
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
// upsert rows through Supabase's REST API with the service role key (bypasses row level security)
async function upsert(table, rows, onConflict) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}${onConflict ? `?on_conflict=${onConflict}` : ""}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
}
const root = process.argv[2] ?? "public/folders";
const IMAGE = /\.(jpe?g|png|webp|avif|gif)$/i;
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;
const dirs = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort(byName);

function csv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) c === '"' && text[i + 1] === '"' ? ((cell += c), i++) : c === '"' ? (q = false) : (cell += c);
    else if (c === '"') q = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim()));
}

for (const folder of dirs(root)) {
  const dir = path.join(root, folder);
  const info = {};
  const csvFile = path.join(dir, "_items.csv");
  if (fs.existsSync(csvFile)) {
    const [head, ...rows] = csv(fs.readFileSync(csvFile, "utf8").replace(/^﻿/, ""));
    for (const r of rows) {
      const attributes = {};
      head.forEach((h, i) => h !== "id" && h !== "title" && r[i] && (attributes[h] = r[i]));
      info[r[head.indexOf("id")]] = { title: r[head.indexOf("title")] || null, attributes };
    }
  }
  const items = dirs(dir).map((id) => ({
    folder_id: folder,
    item_id: id,
    title: info[id]?.title ?? id,
    attributes: info[id]?.attributes ?? {},
    images: fs.readdirSync(path.join(dir, id)).filter((f) => IMAGE.test(f)).sort(byName),
  }));

  await upsert("folders", [{ id: folder, name: folder.replace(/_/g, " ") }]);
  // only these columns are sent, so status / claims / reviews of existing items are left untouched
  for (let i = 0; i < items.length; i += 500) await upsert("items", items.slice(i, i + 500), "folder_id,item_id");
  console.log(`${folder}: ${items.length} items, ${items.reduce((n, it) => n + it.images.length, 0)} images`);
}
