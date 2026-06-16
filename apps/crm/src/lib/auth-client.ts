import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac } from "./permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac })],
});

export const { signIn, signUp, signOut, useSession } = authClient;
