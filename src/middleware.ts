import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js middleware runs BEFORE every matching request.
// We use it to refresh the Supabase auth session automatically.

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[middleware] error:", message);
    // Show env var status to diagnose Vercel build issues
    const hasUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return new Response(
      `Middleware error: ${message} | ENV: url=${hasUrl}, key=${hasKey}`,
      { status: 500 },
    );
  }
}

// Only run middleware on app routes — skip static files and images.
// This regex says: "match everything EXCEPT paths that look like static assets."
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
