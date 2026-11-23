"use client";

// Admin dashboard: who has access, how much each reviewer has done, and progress per folder.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { UserMenu, useReviewer } from "./Gate";

type Member = { email: string; role: "admin" | "reviewer"; active: boolean; added_at: string; name: string | null; last_sign_in: string | null };
type Reviewer = { reviewer: string; name: string | null; email: string | null; day: number; week: number; total: number; with_rejects: number; last_review: string | null };
type Folder = { folder_id: string; name: string; total: number; approved: number; rejected: number };

const when = (t: string | null) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never");
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "-");

export default function Admin() {
  const me = useReviewer();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [reviewers, setReviewers] = useState<Reviewer[] | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("reviewer");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [m, r, f] = await Promise.all([db.rpc("admin_members"), db.rpc("admin_reviewer_stats"), db.rpc("admin_folder_stats")]);
    setError(m.error?.message ?? r.error?.message ?? f.error?.message ?? "");
    setMembers(m.data ?? []);
    setReviewers(r.data ?? []);
    setFolders(f.data ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  const change = async (q: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await q;
    setError(error?.message ?? "");
    if (!error) load();
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) return setError("Enter a full email address.");
    setEmail("");
    change(db.from("members").upsert({ email: em, role, active: true }));
  };
  const update = (m: Member, patch: Partial<Pick<Member, "role" | "active">>) => change(db.from("members").update(patch).eq("email", m.email));
  const remove = (m: Member) => confirm(`Remove ${m.email}? They will lose access straight away.`) && change(db.from("members").delete().eq("email", m.email));

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <Link href="/" className="back" title="All folders">←</Link>
          <b>Admin</b>
        </div>
        <UserMenu />
      </header>

      <main className="home-main admin">
        {error && <p className="t-bad">{error}</p>}

        <h2>People</h2>
        <form className="admin-add" onSubmit={add}>
          <input placeholder="Add someone by Gmail address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as Member["role"])}>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn" disabled={!email.trim()}>Add</button>
        </form>
        <ul className="rows">
          {(members ?? []).map((m) => {
            const self = m.email === me.email.toLowerCase();
            return (
              <li key={m.email} className={m.active ? "" : "off"}>
                <span className="avatar">{(m.name ?? m.email).slice(0, 1).toUpperCase()}</span>
                <div className="grow">
                  <b>{m.name ?? m.email}{self && <em> (you)</em>}</b>
                  <small>{m.name ? `${m.email} · ` : ""}{m.last_sign_in ? `last seen ${when(m.last_sign_in)}` : "hasn't signed in yet"}</small>
                </div>
                {self ? (
                  <span className="tag">Admin</span>
                ) : (
                  <>
                    <select className="plain" value={m.role} onChange={(e) => update(m, { role: e.target.value as Member["role"] })}>
                      <option value="reviewer">Reviewer</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="link" onClick={() => update(m, { active: !m.active })}>{m.active ? "Pause" : "Resume"}</button>
                    <button className="link t-bad" onClick={() => remove(m)}>Remove</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <h2>Reviewers</h2>
        {reviewers && !reviewers.length ? (
          <p className="lead">No reviews yet.</p>
        ) : (
          <ul className="rows">
            {(reviewers ?? []).map((r) => (
              <li key={r.reviewer}>
                <span className="avatar">{(r.name ?? r.email ?? "?").slice(0, 1).toUpperCase()}</span>
                <div className="grow">
                  <b>{r.name ?? r.email}</b>
                  <small>last review {when(r.last_review)}</small>
                </div>
                <span className="stat"><b>{r.day}</b>today</span>
                <span className="stat"><b>{r.week}</b>this week</span>
                <span className="stat"><b>{r.total}</b>total</span>
                <span className="stat"><b className="t-bad">{pct(r.with_rejects, r.total)}</b>with rejects</span>
              </li>
            ))}
          </ul>
        )}

        <h2>Folders</h2>
        <ul className="rows">
          {(folders ?? []).map((f) => {
            const done = Number(f.approved) + Number(f.rejected);
            return (
              <li key={f.folder_id}>
                <div className="grow">
                  <b>{f.name}</b>
                  <div className="bar">
                    <i className="ok" style={{ width: `${(f.approved / Math.max(f.total, 1)) * 100}%` }} />
                    <i className="bad" style={{ width: `${(f.rejected / Math.max(f.total, 1)) * 100}%` }} />
                  </div>
                  <small>{done.toLocaleString()} of {Number(f.total).toLocaleString()} reviewed · <span className="t-bad">{Number(f.rejected).toLocaleString()} with rejects</span></small>
                </div>
                <Link className="ghost" href={`/report?folder=${encodeURIComponent(f.folder_id)}`}>Rejects report</Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
