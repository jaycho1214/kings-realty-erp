"use client";

import * as React from "react";
import { REDUCED_MOTION_QUERY, applyLowPc, readPreference } from "@/lib/low-pc";

/**
 * Keeps 저사양 모드 in step with the OS while the app is open.
 *
 * The inline script in the root layout resolves the mode before paint; this
 * only handles the live case where the preference is 자동 and the staff member
 * flips Windows' "Animation effects" while the tab is already open. Renders
 * nothing.
 */
export function LowPcSync() {
  React.useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => applyLowPc(readPreference());

    // The pre-paint script already ran; re-apply only on OS changes.
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return null;
}
