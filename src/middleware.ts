import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js middleware runs BEFORE every matching request.
// We use it to refresh the Supabase auth session automatically.

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

// Only run middleware on app routes — skip static files and images.
// This regex says: "match everything EXCEPT paths that look like static assets."
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
