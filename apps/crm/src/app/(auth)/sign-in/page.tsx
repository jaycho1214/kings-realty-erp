import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export default async function SignInPage() {
  // Validate the real session here (middleware only checks cookie presence).
  const session = await getSession();
  if (session?.user) {
    redirect("/");
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <AuthShell>
      <LoginForm isDev={isDev} />
    </AuthShell>
  );
}
