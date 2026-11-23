"use client";

// Sign in with Google. Only emails an admin has added (public.members) get past this screen;
// the database checks the same list, so the gate is a convenience, not the security boundary.
import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import type { Session } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";

type Role = "admin" | "reviewer";
type Me = { id: string; name: string; email: string; role: Role; signOut: () => void };
const Ctx = createContext<Me>({ id: "", name: "", email: "", role: "reviewer", signOut: () => {} });
export const useReviewer = () => useContext(Ctx);

// come back to the same page, minus any leftover #fragment or one-time ?code from an earlier sign-in
const here = () => {
  const u = new URL(window.location.href);
  u.hash = "";
  u.searchParams.delete("code");
  return u.toString();
};
const signIn = () => db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here() } });
const signOut = () => db.auth.signOut();

export default function Gate({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null | undefined>(undefined);
  const [name, setName] = useState("");

  useEffect(() => {
    db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      // drop the used ?code= (and any old #tokens) from the address bar once the session is in place
      if (data.session && (location.search.includes("code=") || location.hash)) history.replaceState(null, "", here());
    });
    const { data } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setRole(undefined);
    if (!session) return;
    if (session.user.is_anonymous) {
      signOut(); // left over from the old no-login version
      return;
    }
    const meta = session.user.user_metadata;
    const n = meta.full_name || meta.name || session.user.email || "";
    setName(n);
    db.rpc("my_role").then(async ({ data }) => {
      if (data) await db.from("profiles").upsert({ id: session.user.id, name: n });
      setRole(data ?? null);
    });
  }, [session]);

  if (session === undefined || (session && role === undefined)) return null; // starting up

  if (!session)
    return (
      <main className="signin">
        <form onSubmit={(e) => (e.preventDefault(), signIn())}>
          <Logo height={34} />
          <h1>Listing QC</h1>
          <p>Sign in with the Google account your admin added.</p>
          <button>Sign in with Google</button>
        </form>
      </main>
    );

  if (!role || (admin && role !== "admin"))
    return (
      <main className="signin">
        <form onSubmit={(e) => e.preventDefault()}>
          <Logo height={34} />
          <h1>{role ? "Admins only" : "No access yet"}</h1>
          <p>
            {role ? "This page is for admins." : `${session.user.email} isn't on the reviewer list. Ask an admin to add it.`}
          </p>
          {role ? <Link className="ghost" href="/">Back to folders</Link> : <button onClick={signOut}>Use another account</button>}
        </form>
      </main>
    );

  return <Ctx.Provider value={{ id: session.user.id, name, email: session.user.email ?? "", role, signOut }}>{children}</Ctx.Provider>;
}

export function UserMenu() {
  const { name, role, signOut } = useReviewer();
  return (
    <div className="user">
      <ThemeToggle />
      {role === "admin" && <Link className="ghost" href="/admin">Admin</Link>}
      <Link href="/me" className="me-link" title="Your reviews">
        <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
        <span>{name}</span>
      </Link>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}
