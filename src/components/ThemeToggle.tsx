"use client";

// Light / dark switch. The choice is saved in this browser; until someone picks one, the page follows the system.
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const set = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(set ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage blocked (private window): the choice lasts until the page reloads
    }
    setTheme(next);
  };

  if (!theme) return null;
  return (
    <button className="theme" onClick={flip} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle dark mode">
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
