import * as React from "react";

function subscribe() {
  // Platform never changes during a session, so there's nothing to subscribe to.
  return () => {};
}

function getIsMac() {
  if (typeof navigator === "undefined") return true;
  return /mac|iphone|ipad|ipod/i.test(
    `${navigator.userAgent} ${navigator.platform ?? ""}`,
  );
}

/**
 * True on macOS/iOS, false elsewhere (e.g. Windows, Linux). Used to pick the
 * right modifier symbol in keyboard-shortcut hints (⌘ vs Ctrl). Defaults to
 * macOS during SSR/first paint, then corrects after hydration.
 */
export function useIsMac() {
  return React.useSyncExternalStore(subscribe, getIsMac, () => true);
}
