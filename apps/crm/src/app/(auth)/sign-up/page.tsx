import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignUpForm } from "./_components/sign-up-form";

export default async function SignUpPage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm />
      </div>
    </div>
  );
}
