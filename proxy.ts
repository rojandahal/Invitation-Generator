import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Edge-safe instance — uses only the token (no DB). Authoritative status/role
// checks happen in server components/actions via lib/session.ts.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = Boolean(req.auth?.user);
  const role = req.auth?.user?.role;
  const path = nextUrl.pathname;

  const isAdminRoute = path.startsWith("/admin");

  // Any matched route here is protected: bounce anonymous users to login.
  if (!isLoggedIn) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", path + nextUrl.search);
    return Response.redirect(url);
  }

  // /admin/* additionally requires the ADMIN role.
  if (isAdminRoute && role !== "ADMIN") {
    return Response.redirect(new URL("/dashboard", nextUrl));
  }

  return;
});

export const config = {
  matcher: ["/dashboard/:path*", "/people/:path*", "/admin/:path*"],
};
