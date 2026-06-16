import type { NextAuthConfig } from "next-auth";
import type { Role, UserStatus } from "@prisma/client";

/**
 * Edge-safe Auth.js configuration.
 *
 * This module must NOT import Prisma, bcrypt, or any Node-only code so it can
 * run inside the (edge) middleware. The Credentials provider — which needs the
 * database — is added separately in `lib/auth.ts`.
 *
 * The jwt/session callbacks here only copy fields, so they are shared by both
 * the edge middleware and the Node runtime. Authoritative status checks happen
 * against the database in `lib/session.ts` (see requireUser / requireAdmin).
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24, // 1 day — short-ish so a disabled user is locked out promptly
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? token.sub ?? "";
        if (token.role) session.user.role = token.role as Role;
        if (token.status) session.user.status = token.status as UserStatus;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
