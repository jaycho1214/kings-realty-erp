import { LoginForm } from "@/components/login-form";

export default function SignInPage() {
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm isDev={isDev} />
      </div>
    </div>
  );
}
