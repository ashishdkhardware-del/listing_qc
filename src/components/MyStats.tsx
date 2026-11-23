"use client";

// The signed-in reviewer's own numbers: how many products they reviewed, and how many of those were accepted or rejected.
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { UserMenu, useReviewer } from "./Gate";
import Logo from "./Logo";

type Counts = { total: number; accepted: number; rejected: number };
type Folder = Counts & { id: string; name: string };

export default function MyStats() {
  const me = useReviewer();
  const [all, setAll] = useState<Counts | null>(null);
  const [today, setToday] = useState<Counts | null>(null);
  const [week, setWeek] = useState<Counts | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);

  useEffect(() => {
    const count = async (folder?: string, since?: Date, status?: string) => {
      let q = db.from("items").select("item_id", { count: "exact", head: true }).eq("reviewed_by", me.id);
      if (folder) q = q.eq("folder_id", folder);
      if (since) q = q.gte("reviewed_at", since.toISOString());
      if (status) q = q.eq("status", status);
      return (await q).count ?? 0;
    };
    const counts = async (folder?: string, since?: Date): Promise<Counts> => {
      const [total, accepted, rejected] = await Promise.all([count(folder, since), count(folder, since, "approved"), count(folder, since, "rejected")]);
      return { total, accepted, rejected };
    };
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    counts().then(setAll);
    counts(undefined, midnight).then(setToday);
    counts(undefined, weekAgo).then(setWeek);
    db.from("folders").select("id, name").order("created_at").then(async ({ data }) => {
      const out = await Promise.all((data ?? []).map(async (f) => ({ id: f.id, name: f.name, ...(await counts(f.id)) })));
      setFolders(out.filter((f) => f.total));
    });
  }, [me.id]);

  const rate = (c: Counts | null) => (c?.total ? `${((c.accepted / c.total) * 100).toFixed(0)}%` : "-");
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString());

  return (
    <div className="home">
      <header className="home-top">
        <Link href="/" className="home-link" title="All folders"><Logo height={26} /></Link>
        <UserMenu />
      </header>

      <section className="hero">
        <div className="home-main">
          <h1>Your reviews</h1>
          <p className="lead">Everything you have reviewed, {me.name.split(" ")[0]}.</p>
          <div className="kpis">
            <div><small>Products reviewed</small><b>{n(all?.total)}</b></div>
            <div><small>Accepted</small><b className="t-ok">{n(all?.accepted)}</b></div>
            <div><small>Rejected</small><b className="t-bad">{n(all?.rejected)}</b></div>
            <div><small>Acceptance rate</small><b>{rate(all)}</b></div>
          </div>
        </div>
      </section>

      <main className="home-main admin">
        <h2>Recent</h2>
        <ul className="rows">
          {[["Today", today], ["Last 7 days", week]].map(([label, c]) => {
            const v = c as Counts | null;
            return (
              <li key={label as string}>
                <div className="grow"><b>{label as string}</b></div>
                <span className="stat"><b>{n(v?.total)}</b>reviewed</span>
                <span className="stat"><b className="t-ok">{n(v?.accepted)}</b>accepted</span>
                <span className="stat"><b className="t-bad">{n(v?.rejected)}</b>rejected</span>
              </li>
            );
          })}
        </ul>

        <h2>By folder</h2>
        {folders && !folders.length ? (
          <p className="lead">You haven&apos;t reviewed anything yet. <Link href="/" className="t-ok">Pick a folder</Link> to start.</p>
        ) : (
          <ul className="rows">
            {(folders ?? []).map((f) => (
              <li key={f.id}>
                <div className="grow">
                  <b>{f.name}</b>
                  <div className="bar">
                    <i className="ok" style={{ width: `${(f.accepted / Math.max(f.total, 1)) * 100}%` }} />
                    <i className="bad" style={{ width: `${(f.rejected / Math.max(f.total, 1)) * 100}%` }} />
                  </div>
                </div>
                <span className="stat"><b>{f.total.toLocaleString()}</b>reviewed</span>
                <span className="stat"><b className="t-ok">{f.accepted.toLocaleString()}</b>accepted</span>
                <span className="stat"><b className="t-bad">{f.rejected.toLocaleString()}</b>rejected</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
