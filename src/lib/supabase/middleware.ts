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
  // and also tells us if the user is logged in or not.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ----- Route protection rules -----

  // Rule 1: If user is NOT logged in and tries to access /dashboard/*,
  // send them to the login page.
  if (!user && pathname.startsWith("/dashboard")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Rule 2: If user IS logged in and visits /login,
  // skip login and go straight to the dashboard.
  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  // Rule 3: Root page "/" — redirect based on auth state.
  if (pathname === "/") {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = user ? "/dashboard" : "/login";
    return NextResponse.redirect(targetUrl);
  }

  return supabaseResponse;
}
