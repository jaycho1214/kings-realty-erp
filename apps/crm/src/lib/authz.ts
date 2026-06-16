import { getSession } from "./session";
import {
  adminRole,
  staffRole,
  accountingRole,
  pendingRole,
} from "./permissions";

/**
 * Authorization helpers.
 *
 * The app defines four roles (see ./permissions): "admin", "staff",
 * "accounting", and "pending". New sign-ups default to "pending" and have NO
 * permissions — they must be approved by an admin. Roles compose: better-auth
 * stores the role as a possibly comma-separated multi-role string. Server
 * Actions and Route Handlers are directly invocable endpoints, so
 * authentication alone is not enough: every mutation must also assert that the
 * caller is an approved user, and for privileged operations that the caller
 * actually holds the required resource/action permission (see {@link can} /
 * {@link requirePermission}, which enforce the ./permissions matrix directly
 * instead of approximating it with coarse role checks).
 */

/** Parse a Better Auth role value (possibly comma-separated) into a list. */
function parseRoles(role: unknown): string[] {
  if (typeof role !== "string") return [];
  return role
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

export function isAdmin(role: unknown): boolean {
  return parseRoles(role).includes("admin");
}

export function isAccounting(role: unknown): boolean {
  return parseRoles(role).includes("accounting");
}

/**
 * Approved (active) app user = admin, staff, or accounting — anything other
 * than "pending"/empty. This is the coarse "can use the app at all" gate used
 * across server actions and route handlers.
 */
export function isApprovedUser(role: unknown): boolean {
  const roles = parseRoles(role);
  return (
    roles.includes("admin") ||
    roles.includes("staff") ||
    roles.includes("accounting")
  );
}

/**
 * Back-compat alias for {@link isApprovedUser}. Historically only admin/staff
 * existed; the accounting role is now also an approved user, so existing
 * call sites keep working unchanged.
 */
export const isStaffOrAdmin = isApprovedUser;

/**
 * Can the caller view/edit highly sensitive data (e.g. 임대인 주민등록번호)?
 * Restricted to admin and accounting. See §4.2 of the ERP roadmap.
 */
export function canViewSensitive(role: unknown): boolean {
  return isAdmin(role) || isAccounting(role);
}

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * Require an authenticated, approved (non-"pending") user.
 * Throws if unauthenticated or still awaiting approval. Returns the session.
 */
export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error("인증이 필요합니다.");
  }
  if (!isStaffOrAdmin(session.user.role)) {
    throw new Error("권한이 없습니다.");
  }
  return session;
}

/**
 * Require an admin user (for privileged operations: deleting payments,
 * editing/deleting leases, exchange rates, settings, user management,
 * accounting/settlements). Throws otherwise. Returns the session.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await requireUser();
  if (!isAdmin(session.user.role)) {
    throw new Error("권한이 없습니다.");
  }
  return session;
}

/**
 * Require admin OR accounting (for sensitive financial data and confirmations:
 * 주민등록번호 reveal, 보증금 정산 확정 등). Throws otherwise. Returns the session.
 */
export async function requireSensitiveAccess(): Promise<Session> {
  const session = await requireUser();
  if (!canViewSensitive(session.user.role)) {
    throw new Error("권한이 없습니다.");
  }
  return session;
}

/**
 * Fine-grained permission check against the access-control matrix in
 * ./permissions. This is the single source of truth for "can this role perform
 * <action> on <resource>?" — prefer it over hand-rolled role comparisons so the
 * declared matrix (admin/staff/accounting) is actually enforced. Multi-role
 * strings are OR-combined: holding the permission in ANY of the caller's roles
 * grants access.
 *
 * Example: can(role, "property", "delete"), can(role, "payment", "delete").
 */
const ROLE_DEFS: Record<
  string,
  { authorize: (req: Record<string, string[]>) => { success: boolean } }
> = {
  admin: adminRole,
  staff: staffRole,
  accounting: accountingRole,
  pending: pendingRole,
};

export function can(role: unknown, resource: string, action: string): boolean {
  return parseRoles(role).some((r) => {
    const def = ROLE_DEFS[r];
    return !!def && def.authorize({ [resource]: [action] }).success;
  });
}

/**
 * Require an authenticated, approved caller that holds <resource>:<action> in
 * the permissions matrix. Throws "권한이 없습니다." otherwise. Use this for any
 * mutation whose required strength is role-specific (e.g. accounting may delete
 * payments but not properties; staff may manage properties but not delete
 * leases). Returns the session.
 */
export async function requirePermission(
  resource: string,
  action: string,
): Promise<Session> {
  const session = await requireUser();
  if (!can(session.user.role, resource, action)) {
    throw new Error("권한이 없습니다.");
  }
  return session;
}
