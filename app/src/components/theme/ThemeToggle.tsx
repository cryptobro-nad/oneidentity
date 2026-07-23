"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "one-theme";

/**
 * The active theme lives on the document element (set before paint by the head
 * script). It is external to React, so useSyncExternalStore reads it without an
 * effect and re-renders when it changes.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

// Matches the server-rendered default so hydration is stable; the real value is
// read immediately after and re-rendered if it differs.
function getServerSnapshot(): Theme {
  return "dark";
}

/**
 * Global light/dark switch. The initial theme is applied before paint by the
 * inline head script, so this only reflects and flips that state — it never
 * causes a flash. The label describes the action it will perform.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    const root = document.documentElement;
    root.setAttribute("data-theme", next);
    root.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable; the in-session choice still applies */
    }
  }

  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
    >
      <svg
        className="theme-icon-sun h-[17px] w-[17px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
      </svg>
      <svg
        className="theme-icon-moon h-[17px] w-[17px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2z" />
      </svg>
    </button>
  );
}
