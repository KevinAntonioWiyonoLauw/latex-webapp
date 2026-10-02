import { createAuthClient } from "better-auth/react";

/**
 * Client Better Auth untuk React.
 * Base URL relatif ("") -> lewat Vite proxy / reverse proxy sehingga
 * cookie session bersifat same-origin (menghindari masalah SameSite lintas port).
 */
const API_BASE = import.meta.env.VITE_API_URL ?? "";

export const authClient = createAuthClient({
  baseURL: API_BASE,
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signIn, signUp, signOut } = authClient;
