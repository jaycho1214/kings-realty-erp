"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

export function LoginForm({
  className,
  isDev,
  ...props
}: React.ComponentProps<"div"> & { isDev?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleDevLogin() {
    setError("");
    setLoading(true);
    const { error } = await signIn.email({
      email,
      password,
    });
    if (error) {
      setError(error.message || "로그인에 실패했습니다");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn.email({
      email,
      password,
    });

    if (result.error) {
      setError(result.error.message || "로그인에 실패했습니다");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <Image
              src="/logo.png"
              alt=""
              width={56}
              height={56}
              className="size-14"
              priority
            />
            <h1 className="text-xl font-semibold tracking-tight">
              King&apos;s Realty
            </h1>
            <p className="text-sm text-muted-foreground">
              관리 시스템에 로그인하세요
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">이메일</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">비밀번호</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Field>
            <Button type="submit" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </Field>
          <p className="text-center text-sm text-muted-foreground">
            계정이 없으신가요?{" "}
            <Link
              href="/sign-up"
              className="font-medium text-primary hover:underline"
            >
              가입 신청
            </Link>
          </p>
          {isDev && (
            <Field>
              <Button
                variant="outline"
                type="button"
                disabled={loading}
                onClick={handleDevLogin}
              >
                Admin으로 로그인 (Debug)
              </Button>
            </Field>
          )}
        </FieldGroup>
      </form>
    </div>
  );
}
