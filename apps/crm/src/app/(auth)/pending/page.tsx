import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { PendingNotice } from "./_components/pending-notice";

export default async function PendingPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  // Not logged in → sign-in
  if (!session?.user) {
    redirect("/sign-in");
  }

  // Already approved → dashboard
  if (session.user.role !== "pending") {
    redirect("/");
  }

  return (
    <AuthShell>
      <PendingNotice userName={session.user.name} />
    </AuthShell>
  );
}
