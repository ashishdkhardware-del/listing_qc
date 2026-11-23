"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { db, imageUrl } from "@/lib/supabase";
import { UserMenu, useReviewer } from "./Gate";
import Logo from "./Logo";

type Folder = { id: string; name: string; total: number; approved: number; rejected: number; cover?: string };

const count = async (folder: string, status?: string) => {
  let q = db.from("items").select("item_id", { count: "exact", head: true }).eq("folder_id", folder);
  if (status) q = q.eq("status", status);
  return (await q).count ?? 0;
};

export default function Dashboard() {
  const { name } = useReviewer();
  const [folders, setFolders] = useState<Folder[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await db.from("folders").select("id, name").order("created_at");
      const out = await Promise.all(
        (data ?? []).map(async (f) => {
          const [total, approved, rejected, first] = await Promise.all([
            count(f.id),
            count(f.id, "approved"),
            count(f.id, "rejected"),
            db.from("items").select("item_id, images").eq("folder_id", f.id).order("item_id").limit(1).maybeSingle(),
          ]);
          const it = first.data;
          const cover = it?.images?.[0] ? imageUrl(f.id, it.item_id, it.images[0]) : undefined;
          return { id: f.id, name: f.name, total, approved, rejected, cover };
        })
      );
      setFolders(out);
    })();
  }, []);

  const sum = (k: "total" | "approved" | "rejected") => (folders ?? []).reduce((n, f) => n + f[k], 0);
  const total = sum("total"), approved = sum("approved"), rejected = sum("rejected");

  return (
    <div className="home">
      <header className="home-top">
        <Link href="/" className="home-link" title="All folders"><Logo height={26} /></Link>
        <UserMenu />
      </header>

      <section className="hero">
        <div className="home-main">
          <h1>Hi {name.split(" ")[0]}, welcome back.</h1>
          <p className="lead">Pick a folder to start reviewing.</p>

          <div className="kpis">
          <div><small>Folders</small><b>{folders?.length ?? "…"}</b></div>
          <div><small>Products</small><b>{total.toLocaleString()}</b></div>
          <div><small>To review</small><b>{(total - approved - rejected).toLocaleString()}</b></div>
          <div><small>Clean</small><b className="t-ok">{approved.toLocaleString()}</b></div>
          <div><small>With rejects</small><b className="t-bad">{rejected.toLocaleString()}</b></div>
          </div>
        </div>
      </section>

      <main className="home-main">
        <h2>Folders</h2>
        <div className="folders">
          {(folders ?? []).map((f) => {
            const done = f.approved + f.rejected;
            const q = `?folder=${encodeURIComponent(f.id)}`;
            return (
              <div key={f.id} className="folder">
                <Link href={`/review${q}`} className="cover">{f.cover ? <img src={f.cover} alt="" /> : null}</Link>
                <div className="folder-body">
                  <b>{f.name}</b>
                  <small>{f.total.toLocaleString()} products</small>
                  <div className="bar">
                    <i className="ok" style={{ width: `${(f.approved / Math.max(f.total, 1)) * 100}%` }} />
                    <i className="bad" style={{ width: `${(f.rejected / Math.max(f.total, 1)) * 100}%` }} />
                  </div>
                  <small>
                    {done === f.total ? "Done" : `${(f.total - done).toLocaleString()} to review`} · <span className="t-bad">{f.rejected} with rejects</span>
                  </small>
                  <div className="folder-links">
                    <Link href={`/review${q}`} className="btn ok">Review</Link>
                    <Link href={`/report${q}`} className="ghost">Rejects report</Link>
                  </div>
                </div>
              </div>
            );
          })}
          {folders && !folders.length && <p className="lead">No folders yet. Run the sync script to add some.</p>}
          {!folders && <p className="lead">Loading…</p>}
        </div>
      </main>
    </div>
  );
}
