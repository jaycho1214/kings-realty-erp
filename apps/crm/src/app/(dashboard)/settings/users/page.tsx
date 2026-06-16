import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin as isAdminRole } from "@/lib/authz";
import { getDb } from "@kingsrealty/db";
import { UserList } from "./_components/user-list";
import { PendingUsers } from "./_components/pending-users";
import { CreateUserDialog } from "./_components/create-user-dialog";
import { DataPanel } from "@/components/data-panel";

export default async function UsersSettingsPage() {
  const [session, db] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    Promise.resolve(getDb()),
  ]);

  // User management is admin-only: gate the entire page before any query so the
  // staff roster (emails, roles, ban state) is never fetched/serialized for
  // non-admins.
  if (!isAdminRole(session?.user?.role)) {
    redirect("/");
  }

  const allUsers = await db
    .selectFrom("user")
    .select(["id", "name", "email", "role", "banned", "banReason", "createdAt"])
    .orderBy("createdAt", "asc")
    .execute();

  const currentUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "admin";

  const pendingUsers = allUsers.filter(
    (u) => u.role === "pending" && !u.banned,
  );
  const activeUsers = allUsers.filter((u) => u.role !== "pending");

  return (
    <div className="max-w-3xl space-y-6">
      {/* Pending approval section — admin only */}
      {isAdmin && pendingUsers.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">가입 승인 대기</h2>
            <p className="text-sm text-muted-foreground">
              {pendingUsers.length}명이 승인을 기다리고 있습니다.
            </p>
          </div>
          <DataPanel>
            <PendingUsers users={pendingUsers} />
          </DataPanel>
        </div>
      )}

      {/* Active users */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">사용자 관리</h2>
            <p className="text-sm text-muted-foreground">
              직원 계정 및 권한을 관리합니다.
            </p>
          </div>
          {isAdmin && <CreateUserDialog />}
        </div>
        <DataPanel>
          <UserList
            users={activeUsers}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        </DataPanel>
      </div>
    </div>
  );
}
