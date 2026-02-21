"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Server Action: handles the login form submission.
// It receives FormData (from the <form>), extracts email/password,
// and calls Supabase Auth. On success, it redirects to /dashboard.
// On failure, it returns an error message that the form can display.

export async function signIn(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/dashboard");
}

// Server Action: handles logout.
// Calls Supabase signOut (clears the auth cookie), then redirects to /login.

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
