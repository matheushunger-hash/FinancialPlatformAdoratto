import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js middleware runs BEFORE every matching request.
// We use it to refresh the Supabase auth session automatically.
// CRITICAL: must have a try/catch — an unhandled error here crashes the ENTIRE app.

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    console.error("[middleware] updateSession failed:", error);
    // Let the request through rather than crashing the whole app.
    // The page/API route will handle auth checks as a fallback.
    return NextResponse.next();
  }
}

// Only run middleware on app routes — skip static files and images.
// This regex says: "match everything EXCEPT paths that look like static assets."
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
