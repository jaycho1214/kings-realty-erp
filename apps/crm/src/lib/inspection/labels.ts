import type { ItemStatus } from "./types";

/** Korean labels for the item status enum. Single source for editor + list. */
export const STATUS_LABEL: Record<ItemStatus, string> = {
  na: "미점검",
  good: "양호",
  issue: "이상",
  damage: "파손",
};

/**
 * Active-segment tint for the status control — the same four-state weak-tint
 * vocabulary as `StatusBadge` (border + weak fill + ink), so the inspection
 * control reads as part of the system, not a bespoke widget.
 */
export const STATUS_ACTIVE_CLASS: Record<ItemStatus, string> = {
  na: "border-border bg-secondary text-muted-foreground",
  good: "border-success/25 bg-success-weak text-success",
  issue: "border-warning/30 bg-warning-weak text-warning",
  damage: "border-danger/30 bg-danger-weak text-danger",
};

export const STATUS_ORDER: ItemStatus[] = ["na", "good", "issue", "damage"];
