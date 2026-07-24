/**
 * A schema key that no form submits is a form that can never be submitted: the
 * field is always absent, so validation always fails and the user has no input
 * to fix. This caught landlordSettlementSchema reading `settled_date` when the
 * form sends `date`.
 *
 * The check is deliberately loose — it asserts the name exists *somewhere* in
 * the JSX, not that it belongs to the right form — because that is enough to
 * catch renames and typos without hard-coding a schema→form map.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import * as tenant from "./tenant";
import * as property from "./property";
import * as lease from "./lease";
import * as settings from "./settings";
import { customerIntakeSchema } from "./customer-intake";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Every `name` an input, select, textarea or combobox wrapper submits under. */
function collectFormNames(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/\bname="([^"{}]+)"/g)) names.add(m[1]);
    // Combobox / AutocompleteCreate render their hidden inputs from these.
    for (const m of src.matchAll(/\b(?:textName|idName)="([^"]+)"/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

/** Keys the schema rejects an empty submission over — i.e. the required ones. */
function requiredKeys(schema: z.ZodType): string[] {
  const result = schema.safeParse({});
  if (result.success) return [];
  const keys = new Set<string>();
  for (const issue of result.error.issues) {
    if (typeof issue.path[0] === "string") keys.add(issue.path[0]);
  }
  return [...keys];
}

const schemas: Record<string, unknown> = {
  ...tenant,
  ...property,
  ...lease,
  ...settings,
  customerIntakeSchema: customerIntakeSchema({ today: "2026-07-24" }),
};

test("every required schema key is submitted by some form", () => {
  const formNames = collectFormNames();
  assert.ok(
    formNames.size > 50,
    "expected to find form inputs to check against",
  );

  const problems: string[] = [];
  for (const [name, schema] of Object.entries(schemas)) {
    if (!schema || typeof (schema as z.ZodType).safeParse !== "function") {
      continue;
    }
    const missing = requiredKeys(schema as z.ZodType).filter(
      (k) => !formNames.has(k),
    );
    if (missing.length) problems.push(`${name}: ${missing.join(", ")}`);
  }

  assert.deepEqual(
    problems,
    [],
    `schema keys no form submits:\n  ${problems.join("\n  ")}`,
  );
});
