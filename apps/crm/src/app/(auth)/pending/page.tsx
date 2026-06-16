import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <PendingNotice userName={session.user.name} />
      </div>
    </div>
  );
}
