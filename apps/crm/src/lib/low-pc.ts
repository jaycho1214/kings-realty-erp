/**
 * 저사양 모드 (low PC mode).
 *
 * Staff desks run weak integrated GPUs where animation, transition, and
 * backdrop-filter work costs real frames. This module owns the preference
 * shape and the single source of truth for resolving it.
 *
 * The preference lives in localStorage, not the database, on purpose: it
 * describes the *machine*, not the person. The same staff member on a fast
 * desk and a slow desk wants different answers.
 */

export const LOW_PC_STORAGE_KEY = "kr-low-pc";
export const LOW_PC_ATTRIBUTE = "data-low-pc";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** `auto` follows the OS reduced-motion setting; on/off force it. */
export type LowPcPreference = "auto" | "on" | "off";

export function isLowPcPreference(value: unknown): value is LowPcPreference {
  return value === "auto" || value === "on" || value === "off";
}

/** Read a stored preference, falling back to `auto` for anything unexpected. */
export function parsePreference(stored: string | null): LowPcPreference {
  return isLowPcPreference(stored) ? stored : "auto";
}

/** Whether reduced-cost rendering is active. */
export function resolveLowPc(
  preference: LowPcPreference,
  prefersReducedMotion: boolean,
): boolean {
  if (preference === "on") return true;
  if (preference === "off") return false;
  return prefersReducedMotion;
}

/**
 * Runs before first paint via an inline <script> in the root layout, so the
 * attribute is on <html> before any styled pixel lands and the mode never
 * flashes. Kept as a string because it must not wait for hydration.
 *
 * Mirrors resolveLowPc() — change both together (low-pc.test.ts covers the
 * resolution rules).
 */
export const LOW_PC_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  LOW_PC_STORAGE_KEY,
)});if(p!=="on"&&p!=="off")p="auto";var on=p==="on"||(p==="auto"&&window.matchMedia(${JSON.stringify(
  REDUCED_MOTION_QUERY,
)}).matches);document.documentElement.setAttribute(${JSON.stringify(
  LOW_PC_ATTRIBUTE,
)},on?"on":"off");}catch(e){}})();`;

/** Apply the resolved mode to <html>. No-op on the server. */
export function applyLowPc(preference: LowPcPreference): void {
  if (typeof document === "undefined") return;
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches;

  // Always written, never removed: CSS distinguishes an explicit "off" from
  // "the script never ran", and only falls back to the OS query in the latter.
  document.documentElement.setAttribute(
    LOW_PC_ATTRIBUTE,
    resolveLowPc(preference, prefersReducedMotion) ? "on" : "off",
  );
}

/** Read the stored preference. Returns `auto` on the server or if blocked. */
export function readPreference(): LowPcPreference {
  if (typeof localStorage === "undefined") return "auto";
  try {
    return parsePreference(localStorage.getItem(LOW_PC_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

const listeners = new Set<() => void>();

/** Persist the preference, apply it immediately, and notify subscribers. */
export function writePreference(preference: LowPcPreference): void {
  try {
    localStorage.setItem(LOW_PC_STORAGE_KEY, preference);
  } catch {
    // Private mode / storage disabled — the mode still applies for this tab.
  }
  applyLowPc(preference);
  for (const listener of listeners) listener();
}

/**
 * Subscribe to preference changes, for useSyncExternalStore. Covers both this
 * tab (via writePreference) and other tabs (via the storage event), so a staff
 * member with the CRM open twice sees one consistent setting.
 */
export function subscribePreference(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOW_PC_STORAGE_KEY) {
      applyLowPc(readPreference());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}
