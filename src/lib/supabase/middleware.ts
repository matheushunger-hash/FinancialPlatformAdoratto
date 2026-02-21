import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// This helper refreshes the auth token on every request.
// Think of it like a security guard at the door: every time someone walks in,
// the guard checks their badge and renews it if it's about to expire.
// Without this, users would get randomly logged out when their JWT expires.

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update cookies on both the request (for downstream code)
          // and the response (so the browser gets the updated token)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // This is the key line: it triggers the token refresh
  await supabase.auth.getUser();

  return supabaseResponse;
}
