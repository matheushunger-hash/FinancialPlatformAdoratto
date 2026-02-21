import { createBrowserClient } from "@supabase/ssr";

// Client-side Supabase client — used in "use client" components.
// It runs in the browser and manages the auth session via cookies.
// The NEXT_PUBLIC_ prefix means these values are safe to expose to the browser
// (the anon key only grants access that RLS policies allow).

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
