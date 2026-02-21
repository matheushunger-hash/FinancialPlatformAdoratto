import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// This script resets the password for all seed users using the Supabase Admin API.
// Usage: NEW_PASSWORD="your-new-password" npm run db:reset-passwords

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const NEW_PASSWORD = process.env.NEW_PASSWORD;
if (!NEW_PASSWORD) {
  throw new Error(
    'NEW_PASSWORD is required. Usage: NEW_PASSWORD="your-new-password" npm run db:reset-passwords',
  );
}

if (NEW_PASSWORD.length < 8) {
  throw new Error("Password must be at least 8 characters long");
}

const userEmails = [
  "adm@superadoratto.com.br",
  "gabriel@superadoratto.com.br",
  "compras@superadoratto.com.br",
];

async function main() {
  // Fetch all auth users to find their IDs by email
  const { data: allUsers, error: listError } =
    await supabaseAdmin.auth.admin.listUsers();

  if (listError) {
    throw new Error(`Failed to list users: ${listError.message}`);
  }

  for (const email of userEmails) {
    const user = allUsers.users.find((u) => u.email === email);

    if (!user) {
      console.log(`  SKIPPED: ${email} — not found in Supabase Auth`);
      continue;
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: NEW_PASSWORD,
    });

    if (error) {
      console.error(`  FAILED: ${email} — ${error.message}`);
    } else {
      console.log(`  OK: ${email} — password updated`);
    }
  }

  console.log("\nPassword reset completed!");
}

main().catch((e) => {
  console.error("Password reset failed:", e);
  process.exit(1);
});
