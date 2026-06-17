"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { CheckCircle2 } from "lucide-react";

export function SignUpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);

    const { error } = await signUp.email({
      name,
      email,
      password,
    });

    if (error) {
      setError(error.message || "가입에 실패했습니다.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-success-weak">
            <CheckCircle2 className="size-6 text-success" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            가입 신청 완료
          </h1>
          <p className="text-sm text-muted-foreground">
            관리자의 승인 후 로그인할 수 있습니다.
            <br />
            승인이 완료되면 로그인해 주세요.
          </p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => router.push("/sign-in")}
          >
            로그인 페이지로 이동
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <Image
              src="/logo.png"
              alt="King's Realty"
              width={56}
              height={56}
              className="size-14"
              priority
            />
            <h1 className="text-xl font-semibold tracking-tight">가입 신청</h1>
            <p className="text-sm text-muted-foreground">
              관리자 승인 후 사용할 수 있습니다
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="name">이름</FieldLabel>
            <Input
              id="name"
              type="text"
              placeholder="홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
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
              placeholder="8자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">비밀번호 확인</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="비밀번호 재입력"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Field>
            <Button type="submit" disabled={loading}>
              {loading ? "처리 중..." : "가입 신청"}
            </Button>
          </Field>
          <p className="text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link
              href="/sign-in"
              className="font-medium text-primary hover:underline"
            >
              로그인
            </Link>
          </p>
        </FieldGroup>
      </form>
    </div>
  );
}
