import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";

export default async function SignInPage() {
  // Validate the real session here (middleware only checks cookie presence).
  const session = await getSession();
  if (session?.user) {
    redirect("/");
  }

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm isDev={isDev} />
      </div>
    </div>
  );
}
