import type { PlanBucket, TaskStatus } from "./board";

export type { PlanBucket, TaskStatus };

export type SuggestionKind =
  | "lease_expiry"
  | "charge_due"
  | "service_open"
  | "deros";

export interface SuggestedTask {
  dedupKey: string;
  kind: SuggestionKind;
  title: string;
  dueDate: string | null; // "YYYY-MM-DD"
  refEntityType: string;
  refEntityId: number;
  suggestedAssigneeIds: number[];
}

export interface TaskAssigneeView {
  id: number;
  name: string;
  image: string | null;
}

export type LinkEntityType =
  | "tenant"
  | "property"
  | "landlord"
  | "lease"
  | "service_request"
  | "appliance";

export interface TaskLinkView {
  type: LinkEntityType;
  id: number;
  label: string;
}

export interface TaskView {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  planned_date: string | null; // "YYYY-MM-DD"
  due_date: string | null; // "YYYY-MM-DD"
  sort_order: number;
  source: "manual" | "suggestion";
  suggestion_key: string | null;
  ref_entity_type: string | null;
  ref_entity_id: number | null;
  created_by: number;
  completed_at: string | null; // "YYYY-MM-DD"
  assignees: TaskAssigneeView[];
  links: TaskLinkView[];
}

export interface StaffOption {
  id: number;
  name: string;
  image: string | null;
}

export interface BoardData {
  tasks: TaskView[];
  suggestions: SuggestedTask[];
  staff: StaffOption[];
  currentUserId: number;
}
