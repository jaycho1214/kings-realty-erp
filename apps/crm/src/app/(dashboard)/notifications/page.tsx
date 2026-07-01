import { getDb } from "@kingsrealty/db";
import { PageHeader } from "@/components/page-header";
import { getSession } from "@/lib/session";
import { NotificationList } from "./_components/notification-list";

export default async function NotificationsPage() {
  const db = getDb();
  const session = await getSession();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const notifications = await db
    .selectFrom("notification")
    .select([
      "id",
      "type",
      "title",
      "message",
      "due_date",
      "ref_entity_type",
      "ref_entity_id",
      "is_read",
      "created_at",
    ])
    .where((eb) =>
      eb.or([
        eb("target_user_id", "is", null),
        ...(userId != null ? [eb("target_user_id", "=", userId)] : []),
      ]),
    )
    .orderBy("is_read", "asc")
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-5">
      <PageHeader title="알림 센터" count={unread} />
      <NotificationList
        notifications={notifications.map((n) => ({
          ...n,
          due_date: n.due_date
            ? new Date(n.due_date).toISOString().split("T")[0]
            : null,
          created_at:
            n.created_at instanceof Date
              ? n.created_at.toISOString()
              : String(n.created_at),
        }))}
      />
    </div>
  );
}
