"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// A thin bar across the top that starts the moment an internal link is tapped and
// finishes when the new route renders. Server-rendered pages take a beat to arrive,
// and without this the tap felt ignored until the page suddenly changed.
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  // `from` is the route the tap happened on; once the route differs, we are done.
  const [progress, setProgress] = useState<{ from: string } | null>(null);
  const finishing = progress !== null && progress.from !== routeKey;

  useEffect(() => {
    let giveUp: number | undefined;
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page (or only the hash changed): nothing is going to load.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setProgress({ from: `${window.location.pathname}?${window.location.search.slice(1)}` });
      // Never leave a bar stuck if the navigation is abandoned.
      window.clearTimeout(giveUp);
      giveUp = window.setTimeout(() => setProgress(null), 12_000);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(giveUp);
    };
  }, []);

  useEffect(() => {
    if (!finishing) return;
    const timer = window.setTimeout(() => setProgress(null), 450);
    return () => window.clearTimeout(timer);
  }, [finishing]);

  if (!progress) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]">
      <div className={`nav-progress-bar h-full bg-[#f6b73c] shadow-[0_0_10px_rgba(246,183,60,0.7)] ${finishing ? "nav-progress-done" : ""}`} />
    </div>
  );
}
