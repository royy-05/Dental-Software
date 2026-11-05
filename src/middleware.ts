import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

/**
 * Page guard: panel pages need a session cookie, otherwise redirect to /login. This only checks the signed JWT
 * (edge runtime); revocation, idle timeout and permissions are enforced by every API route.
 * Security headers are added to every response.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const needsLogin = pathname.startsWith("/clinic") || pathname.startsWith("/admin") || pathname.startsWith("/account");
  if (needsLogin && !req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // The booking widget is embeddable in clinic websites; everything else may not be framed.
  if (!pathname.startsWith("/book")) res.headers.set("X-Frame-Options", "SAMEORIGIN");
  if (pathname.startsWith("/clinic") || pathname.startsWith("/admin")) res.headers.set("Cache-Control", "no-store");
  return res;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
