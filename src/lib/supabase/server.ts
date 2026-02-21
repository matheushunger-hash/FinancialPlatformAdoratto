import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client — used in Server Components, Server Actions,
// and Route Handlers. It reads the auth token from cookies.
//
// This is an async function because `cookies()` is async in Next.js 15+.
// Every time you need to check "who is logged in?" on the server, you call this.

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll can fail in Server Components (they're read-only).
            // That's fine — the middleware handles setting cookies instead.
          }
        },
      },
    },
  );
}
