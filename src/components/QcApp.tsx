"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@/lib/types";
import { db, toItem, type ItemRow } from "@/lib/supabase";
import { UserMenu } from "./Gate";
import Logo from "./Logo";

type Done = { item: Item; rejected: string[] };
const BATCH = 4; // products claimed ahead, so Space never waits on the network

export default function QcApp({ folder }: { folder: string }) {
  const [name, setName] = useState(folder.replace(/_/g, " "));
  const [queue, setQueue] = useState<Item[]>([]); // claimed by me, not reviewed yet; queue[0] is on screen
  const [history, setHistory] = useState<Done[]>([]); // reviewed by me this session
  const [back, setBack] = useState<number | null>(null); // index into history while looking back
  const [draft, setDraft] = useState<{ id: string; rejected: string[] } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");
  const [counts, setCounts] = useState({ total: 0, approved: 0, rejected: 0 });
  const [dir, setDir] = useState(1);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "bad"; key: number } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [copied, setCopied] = useState(false);
  // Space animation: the saved images glide out left, then the next ones glide in from the right; a faint green/red edge confirms the save
  const [leaving, setLeaving] = useState<(Done & { key: number }) | null>(null);
  const [burst, setBurst] = useState<{ kind: "ok" | "bad"; key: number } | null>(null);
  const [windIn, setWindIn] = useState(false); // the product on screen arrived with Space
  const claiming = useRef(false);

  const say = (text: string, kind: "ok" | "bad") => setToast({ text, kind, key: Date.now() });

  const refreshCounts = useCallback(async () => {
    const c = async (status?: string) => {
      let q = db.from("items").select("item_id", { count: "exact", head: true }).eq("folder_id", folder);
      if (status) q = q.eq("status", status);
      return (await q).count ?? 0;
    };
    const [total, approved, rejected] = await Promise.all([c(), c("approved"), c("rejected")]);
    setCounts({ total, approved, rejected });
  }, [folder]);

  // Ask the database for the next free products; the lock there guarantees nobody else gets them.
  const claim = useCallback(async () => {
    if (claiming.current) return;
    claiming.current = true;
    const { data, error } = await db.rpc("claim_next", { p_folder: folder, p_count: BATCH });
    claiming.current = false;
    if (error) return say(`Couldn't load products: ${error.message}`, "bad");
    const fresh = ((data ?? []) as ItemRow[]).map(toItem).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    setQueue((q) => [...q, ...fresh.filter((it) => !q.some((x) => x.id === it.id))]);
    for (const it of fresh) for (const im of it.images) new Image().src = im.url; // warm the browser cache
    return fresh.length;
  }, [folder]);

  useEffect(() => {
    db.from("folders").select("name").eq("id", folder).maybeSingle().then(({ data }) => data && setName(data.name));
    refreshCounts();
    (async () => {
      // ?item=<id> (from the rejects report) opens that product first, with its saved rejects
      const want = new URLSearchParams(window.location.search).get("item");
      if (want) {
        const [{ data: row }, { data: rej }] = await Promise.all([
          db.from("items").select("folder_id, item_id, title, attributes, images").eq("folder_id", folder).eq("item_id", want).maybeSingle(),
          db.from("rejected_images").select("file").eq("folder_id", folder).eq("item_id", want),
        ]);
        if (row) {
          setHistory([{ item: toItem(row as ItemRow), rejected: (rej ?? []).map((r) => r.file) }]);
          setBack(0);
        }
      }
      const n = await claim();
      setState(n || want ? "ready" : "empty");
    })();
  }, [folder, claim, refreshCounts]);

  const viewing: Done | undefined = back !== null ? history[back] : queue[0] ? { item: queue[0], rejected: [] } : undefined;
  const item = viewing?.item;
  const rejected = (item && draft?.id === item.id ? draft.rejected : viewing?.rejected) ?? [];

  useEffect(() => {
    if (state === "ready" && !queue.length && back === null) claim().then((n) => !n && setState("empty"));
  }, [queue.length, back, state, claim]);

  const toggleImage = (i: number) => {
    if (!item) return;
    const key = item.images[i].label;
    setDraft({ id: item.id, rejected: rejected.includes(key) ? rejected.filter((k) => k !== key) : [...rejected, key] });
  };

  // Space: record this product (only the clicked images count as rejected) and show the next one.
  const saveNext = async () => {
    if (!item) return;
    const entry: Done = { item, rejected };
    const key = Date.now();
    setLeaving({ ...entry, key });
    setWindIn(true);
    setBurst({ kind: rejected.length ? "bad" : "ok", key });
    setTimeout(() => setLeaving((l) => (l?.key === key ? null : l)), 450);
    setDir(1);
    setDraft(null);
    if (back !== null) {
      setHistory((h) => h.map((d, i) => (i === back ? entry : d)));
      setBack(back + 1 < history.length ? back + 1 : null);
    } else {
      setHistory((h) => [...h, entry]);
      setQueue((q) => q.slice(1));
      if (queue.length <= 2) claim();
    }
    const { error } = await db.rpc("save_review", { p_folder: folder, p_item: item.id, p_rejected: rejected });
    if (error) return say(`Not saved (${item.id}): ${error.message}`, "bad");
    say(rejected.length ? `Saved · ${rejected.length} rejected` : "✓ Saved · no rejects", rejected.length ? "bad" : "ok");
    refreshCounts();
  };

  const goBack = () => {
    const i = (back ?? history.length) - 1;
    if (i >= 0) setDir(-1), setDraft(null), setBack(i);
  };
  const goForward = () => {
    if (back === null) return;
    setDir(1), setDraft(null), setBack(back + 1 < history.length ? back + 1 : null);
  };

  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  onKey.current = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === " ") return e.preventDefault(), saveNext();
    if (k === "escape") return setDrawer(false);
    if (/^[1-9]$/.test(k) && item?.images[+k - 1]) return toggleImage(+k - 1);
    if (k === "l") return setDrawer((d) => !d);
    if (k === "arrowleft") return goBack();
    if (k === "arrowright") return goForward();
  };

  const copyId = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.id);
    } catch {
      // clipboard API blocked (embedded frames, older browsers): fall back to a hidden selection copy
      const t = document.createElement("textarea");
      t.value = item.id;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand("copy");
      t.remove();
      if (!ok) return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const n = item?.images.length ?? 0;
  const reviewed = counts.approved + counts.rejected;

  // the image grid; also drawn for the product that is leaving, so it can animate away
  const grid = (it: Item, rej: string[], cls: string, onClick?: (i: number) => void) => {
    const cols = Math.min(4, Math.max(it.images.length, 1));
    const rows = Math.max(1, Math.ceil(it.images.length / 4));
    return (
      <div key={it.id} className={`images ${cls}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, ["--c" as string]: cols, ["--r" as string]: rows }}>
        {it.images.map((im, i) => (
          <figure key={im.url} className={rej.includes(im.label) ? "rej" : ""} style={{ ["--i" as string]: i }} onClick={onClick && (() => onClick(i))}>
            <img src={im.url} alt={im.label} draggable={false} />
          </figure>
        ))}
      </div>
    );
  };

  return (
    <div className="qc">
      <header className="bar-top">
        <Link href="/" className="home-link" title="All folders"><Logo height={26} /></Link>
        <span className="sep" />
        <div className="where">
          <b>{name}</b>
          <small>{back !== null ? "Editing an earlier review" : `${history.length} reviewed by you this session`}</small>
        </div>
        <div className="progress">
          <div className="bar">
            <i className="ok" style={{ width: `${(counts.approved / Math.max(counts.total, 1)) * 100}%` }} />
            <i className="bad" style={{ width: `${(counts.rejected / Math.max(counts.total, 1)) * 100}%` }} />
          </div>
          <small>
            {reviewed} of {counts.total} reviewed by the team · <span className="t-bad">{counts.rejected} with rejects</span>
          </small>
        </div>
        <button className="ghost" onClick={() => setDrawer((d) => !d)} title="Reviewed this session (L)">☰ My reviews</button>
        <Link className="ghost" href={`/report?folder=${encodeURIComponent(folder)}`}>Rejects report</Link>
        <UserMenu />
      </header>

      {drawer && (
        <aside className="drawer">
          <p className="drawer-title">Reviewed by you this session</p>
          <ul>
            {[...history].reverse().map((d, ri) => {
              const i = history.length - 1 - ri;
              return (
                <li key={d.item.id} className={back === i ? "on" : ""} onClick={() => { setDraft(null); setBack(i); setDrawer(false); }}>
                  {d.item.images[0] ? <img src={d.item.images[0].url} alt="" /> : <span className="noimg" />}
                  <div>
                    <b>{d.item.title}</b>
                    <small>{d.item.id}{d.rejected.length ? ` · ${d.rejected.length} rejected` : ""}</small>
                  </div>
                  <span className={`dot ${d.rejected.length ? "rejected" : "approved"}`} />
                </li>
              );
            })}
            {!history.length && <li className="none">Nothing yet.</li>}
          </ul>
        </aside>
      )}

      <main className="stage">
        {state === "loading" ? (
          <div className="empty">Loading…</div>
        ) : !item ? (
          <div className="empty">{state === "empty" ? "All products in this folder are reviewed or being reviewed by someone else." : "Loading…"}</div>
        ) : !n ? (
          <div className="empty">This product has no images.</div>
        ) : (
          grid(item, rejected, dir < 0 ? "from-left" : windIn ? "after-save" : "", toggleImage)
        )}
        {leaving && leaving.item.id !== item?.id && <div className="leaving-layer" key={`leaving-${leaving.key}`}>{grid(leaving.item, leaving.rejected, "leaving")}</div>}
        {burst && (
          <div key={`burst-${burst.key}`} className={`burst ${burst.kind}`} onAnimationEnd={() => setBurst(null)} />
        )}
      </main>

      {toast && (
        <div key={toast.key} className={`toast ${toast.kind}`} onAnimationEnd={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      {item && (
        <footer className="bar-bottom">
          <button className="nav" onClick={goBack} disabled={(back ?? history.length) === 0} title="Previous (←)">‹</button>
          <div className="summary">
            {rejected.length ? <span className="t-bad">{rejected.length} of {n} rejected</span> : <span className="t-ok">No rejects</span>}
          </div>
          <span className="hint">Click an image to reject it · <kbd>Space</kbd> next product</span>
          <div className="mpn">
            <button onClick={copyId} title="Copy">
              <span className="mpn-id">{item.id}</span>
              <span className="mpn-act">{copied ? "Copied ✓" : "Copy"}</span>
            </button>
            <a href={`https://www.google.com/search?q=${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer" title="Search on Google">
              Search ↗
            </a>
          </div>
          <button className="btn ok" onClick={saveNext}>Next <kbd>Space</kbd></button>
          <button className="nav" onClick={goForward} disabled={back === null} title="Forward (→)">›</button>
        </footer>
      )}
    </div>
  );
}
