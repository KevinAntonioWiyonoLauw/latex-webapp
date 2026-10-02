import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  COOKIE_SECURE,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  WEB_ORIGINS,
} from "../config.js";

/** Konfigurasi provider sosial, hanya ditambahkan bila kredensial diisi. */
const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  };
}
if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
  };
}

/**
 * Instance Better Auth.
 * - Email & password aktif.
 * - OAuth Google/GitHub aktif otomatis bila kredensial tersedia.
 * - Adapter Drizzle (PostgreSQL).
 */
export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 6,
  },
  socialProviders,
  trustedOrigins: [
    ...WEB_ORIGINS,
    BETTER_AUTH_URL,
    // Varian umum dev (port FE/BE, host localhost vs 127.0.0.1).
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ],
  advanced: {
    // Cookie: secure otomatis saat HTTPS (produksi).
    defaultCookieAttributes: {
      sameSite: "lax",
      secure: COOKIE_SECURE,
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
