"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { db, imageUrl } from "@/lib/supabase";
import { UserMenu } from "./Gate";

type Row = { item_id: string; file: string; slide: number; reviewer_name: string | null; rejected_at: string; title?: string };

// Supabase returns at most 1000 rows per request: page through everything.
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export default function Report({ folder }: { folder: string }) {
  const [name, setName] = useState(folder.replace(/_/g, " "));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [seen, setSeen] = useState<{ items: number; images: number; bySlide: number[] }>({ items: 0, images: 0, bySlide: [] });
  const [total, setTotal] = useState(0);
  const [slide, setSlide] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: f }, { count }, rej, done] = await Promise.all([
        db.from("folders").select("name").eq("id", folder).maybeSingle(),
        db.from("items").select("item_id", { count: "exact", head: true }).eq("folder_id", folder),
        all<Row>((a, b) => db.from("rejected_images").select("item_id, file, slide, reviewer_name, rejected_at").eq("folder_id", folder).order("rejected_at", { ascending: false }).range(a, b)),
        all<{ item_id: string; title: string | null; images: string[] }>((a, b) => db.from("items").select("item_id, title, images").eq("folder_id", folder).neq("status", "pending").range(a, b)),
      ]);
      if (f) setName(f.name);
      setTotal(count ?? 0);
      const titles = Object.fromEntries(done.map((d) => [d.item_id, d.title ?? d.item_id]));
      setRows(rej.map((r) => ({ ...r, title: titles[r.item_id] ?? r.item_id })));
      // how many reviewed products had a slide at each position, for the per-slide reject rate
      const bySlide: number[] = [];
      for (const d of done) d.images.forEach((_, i) => (bySlide[i] = (bySlide[i] ?? 0) + 1));
      setSeen({ items: done.length, images: done.reduce((n, d) => n + d.images.length, 0), bySlide });
    })();
  }, [folder]);

  const list = rows ?? [];
  const slides = Array.from({ length: Math.max(seen.bySlide.length, ...list.map((r) => r.slide)) }, (_, i) => ({
    slide: i + 1,
    seen: seen.bySlide[i] ?? 0,
    count: list.filter((r) => r.slide === i + 1).length,
  }));
  const top = Math.max(1, ...slides.map((s) => s.count));
  const worst = [...slides].sort((a, b) => b.count - a.count)[0];
  const shown = list.filter((r) => slide === null || r.slide === slide);

  // one entry per product, its rejected slides in slide order (list keeps newest products first)
  const group = (rs: Row[]) => {
    const by = new Map<string, Row[]>();
    rs.forEach((r) => by.set(r.item_id, [...(by.get(r.item_id) ?? []), r]));
    return [...by.values()].map((g) => g.sort((x, y) => x.slide - y.slide));
  };
  const products = group(shown);
  const link = (r: Row) => new URL(imageUrl(folder, r.item_id, r.file), window.location.href).href;

  // MPN, then a "Rejected slide N" / "Rejected slide N link" pair for each rejected image of that product
  const exportCsv = () => {
    const all = group(list);
    const pairs = Math.max(1, ...all.map((g) => g.length));
    const head = ["MPN", ...Array.from({ length: pairs }, (_, i) => [`Rejected slide ${i + 1}`, `Rejected slide ${i + 1} link`]).flat()];
    const out = [head, ...all.map((g) => [g[0].item_id, ...g.flatMap((r) => [`Slide ${r.slide}`, link(r)])])];
    const csv = out.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    a.download = `rejects-${folder}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <Link href="/" className="back" title="All folders">←</Link>
          <b>{name}</b>
          <span className="crumb">Rejects report</span>
        </div>
        <div className="brand">
          <Link className="ghost" href={`/review?folder=${encodeURIComponent(folder)}`}>Open review</Link>
          <UserMenu />
        </div>
      </header>

      <section className="hero">
        <div className="home-main">
          <p className="eyebrow">Rejects report</p>
          <h1>{name}</h1>
          <p className="lead">Every image a reviewer rejected, grouped by slide.</p>
          <div className="kpis">
          <div><small>Products reviewed</small><b>{seen.items} <span className="of">/ {total}</span></b></div>
          <div><small>Products with rejects</small><b className="t-bad">{new Set(list.map((r) => r.item_id)).size}</b></div>
          <div><small>Rejected images</small><b className="t-bad">{list.length}</b></div>
          <div><small>Image reject rate</small><b>{seen.images ? ((list.length / seen.images) * 100).toFixed(1) : "0"}%</b></div>
          <div><small>Most rejected</small><b className="small">{worst?.count ? `Slide ${worst.slide}` : "—"}</b></div>
          </div>
        </div>
      </section>

      <main className="home-main">
        <h2>Rejects by slide</h2>
        <ul className="bars">
          {slides.map((s) => (
            <li key={s.slide} className={slide === s.slide ? "on" : ""} onClick={() => setSlide(slide === s.slide ? null : s.slide)}>
              <span className="lab">Slide {s.slide}</span>
              <span className="track"><i style={{ width: `${(s.count / top) * 100}%` }} /></span>
              <span className="val">{s.count}<small>{s.seen ? ` · ${((s.count / s.seen) * 100).toFixed(0)}%` : ""}</small></span>
            </li>
          ))}
          {!slides.length && <li className="none">{rows ? "Nothing reviewed yet." : "Loading…"}</li>}
        </ul>

        <h2>
          Rejected images
          {slide !== null && <button className="clear" onClick={() => setSlide(null)}>Slide {slide} ✕</button>}
          <button className="btn push" onClick={exportCsv} disabled={!list.length}>Download CSV report</button>
        </h2>
        <ul className="rej-list">
          {products.map((g) => {
            const open = `/review?folder=${encodeURIComponent(folder)}&item=${encodeURIComponent(g[0].item_id)}`;
            return (
              <li key={g[0].item_id}>
                <div className={`shots n${Math.min(g.length, 5)}`}>
                  {g.map((r) => (
                    <a key={r.file} href={link(r)} target="_blank" rel="noopener noreferrer" title={`Open slide ${r.slide} full size`}>
                      <img src={imageUrl(folder, r.item_id, r.file)} alt="" />
                      <span>Slide {r.slide}</span>
                    </a>
                  ))}
                </div>
                <Link href={open} className="who" title="Open in review">
                  <b>{g[0].item_id}</b>
                  <small>{g[0].reviewer_name ?? "-"} · {new Date(g[0].rejected_at).toLocaleDateString()}</small>
                </Link>
              </li>
            );
          })}
          {rows && !products.length && <li className="none">Nothing rejected{slide !== null ? " on this slide" : " yet"}.</li>}
        </ul>
      </main>
    </div>
  );
}
