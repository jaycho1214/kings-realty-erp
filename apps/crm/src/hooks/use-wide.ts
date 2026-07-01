import * as React from "react";

// Tailwind `xl`. Above this the detail side rail has room; below it the rail's
// content is better shown as a tab.
const WIDE_BREAKPOINT = 1280;

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(min-width: ${WIDE_BREAKPOINT}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsWide() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth >= WIDE_BREAKPOINT,
    () => true, // SSR: assume wide so the rail markup renders desktop-first
  );
}
