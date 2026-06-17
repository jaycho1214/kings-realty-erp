import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { SignUpForm } from "./_components/sign-up-form";

export default async function SignUpPage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/");
  }

  return (
    <AuthShell>
      <SignUpForm />
    </AuthShell>
  );
}
