import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const publicRoutes = ["/sign-in", "/sign-up"];

export default function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.some((route) => path.startsWith(route));
  const isPendingRoute = path.startsWith("/pending");
  const session = getSessionCookie(request);

  // Unauthenticated → sign-in (unless already on public or pending route)
  if (!session && !isPublicRoute && !isPendingRoute) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // NOTE: we deliberately do NOT bounce "logged-in" users off the public routes
  // here. getSessionCookie only checks cookie *presence*, not validity — a
  // stale/expired cookie would send /sign-in → / while the dashboard layout
  // sends / → /sign-in (no valid session), an infinite redirect loop. The
  // sign-in/sign-up pages validate the real session and redirect themselves.

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip API routes, Next internals, and any static asset (paths ending in a
    // file extension: favicon.ico, robots.txt, logo.png, icon.png, bank logos,
    // fonts, …). App routes have no extension, so they stay protected.
    "/((?!api|_next/static|_next/image|.*\\.[^/]+$).*)",
  ],
};
