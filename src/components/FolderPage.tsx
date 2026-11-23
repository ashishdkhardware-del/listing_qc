"use client";

// Review and report pages take the folder from ?folder=, so new folders work without a rebuild.
import { useSearchParams } from "next/navigation";
import Gate from "./Gate";
import QcApp from "./QcApp";
import Report from "./Report";

export default function FolderPage({ view }: { view: "review" | "report" }) {
  const folder = useSearchParams().get("folder");
  if (!folder) return <main className="signin"><p className="lead">No folder chosen. Go back to the dashboard.</p></main>;
  return <Gate>{view === "review" ? <QcApp folder={folder} /> : <Report folder={folder} />}</Gate>;
}
