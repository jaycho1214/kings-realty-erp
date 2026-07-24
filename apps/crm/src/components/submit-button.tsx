"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useFormError } from "@/components/action-form";

export function SubmitButton({
  label = "저장",
  disabled = false,
}: {
  label?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  // Inside an <ActionForm>, a failed submit surfaces here — beside the button
  // the user just pressed. Under a plain <form> this stays empty.
  const error = useFormError();

  return (
    <>
      {error ? (
        <p role="alert" className="mr-auto self-center text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending || disabled}>
        {pending ? "저장 중..." : label}
      </Button>
    </>
  );
}
