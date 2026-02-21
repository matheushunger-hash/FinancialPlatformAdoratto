import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The root page simply redirects based on auth state.
// Middleware already handles this, but having it here is a safety net.

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
