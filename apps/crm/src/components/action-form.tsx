"use client";

import { createContext, useActionState, useContext } from "react";
import type { FormState } from "@/lib/form-action";

/**
 * A <form> whose server action reports expected failures as state instead of
 * throwing them. Next.js strips the message off anything thrown out of a Server
 * Action in production, so a plain `<form action={serverAction}>` can only ever
 * show the staff a generic error card — see src/lib/form-action.ts.
 *
 * Drop-in for `<form>`: swap the tag and the action keeps the same shape.
 * The message surfaces next to <SubmitButton>, where the user just clicked.
 */

const FormErrorContext = createContext<string | undefined>(undefined);

/** The current submission's error message, if the last submit failed. */
export function useFormError(): string | undefined {
  return useContext(FormErrorContext);
}

/**
 * A form-bound server action. Deliberately keeps the plain `(formData)` shape
 * the codebase already uses — the `prevState` argument useActionState wants is
 * absorbed below, so `.bind(null, id)` call sites stay untouched.
 */
export type FormAction = (formData: FormData) => Promise<FormState | void>;

type Props = Omit<React.ComponentProps<"form">, "action"> & {
  action: FormAction;
};

// `ref` rides along in `...props` and lands on the <form> below — React 19
// passes it to function components as an ordinary prop, so callers that keep a
// formRef to .reset() the row still work.
export function ActionForm({ action, children, ...props }: Props) {
  const [state, formAction] = useActionState<FormState, FormData>(
    async (_prev, formData) => (await action(formData)) ?? {},
    {},
  );

  return (
    <FormErrorContext.Provider value={state?.error}>
      <form {...props} action={formAction}>
        {children}
      </form>
    </FormErrorContext.Provider>
  );
}
