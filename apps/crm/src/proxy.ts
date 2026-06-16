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

  // Authenticated → redirect away from public routes (sign-in/sign-up)
  if (session && isPublicRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
