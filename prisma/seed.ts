import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient, Role } from "@prisma/client";

// This script seeds the database with initial users.
// It creates each user in TWO places:
//   1. Supabase Auth — handles login credentials (email/password, JWT tokens)
//   2. Prisma users table — stores profile data (name, role)
// Both share the same UUID, so they stay in sync.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Prisma 7.x requires a driver adapter — same setup as the app's prisma.ts.
// We use DIRECT_URL (port 5432) instead of DATABASE_URL (pooled, port 6543)
// because the pg driver doesn't work well with Supabase's connection pooler.
const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SEED_PASSWORD = process.env.SEED_PASSWORD;
if (!SEED_PASSWORD) {
  throw new Error("SEED_PASSWORD is required in .env — used to create auth users");
}

const users = [
  { email: "adm@superadoratto.com.br", name: "Matheus", role: Role.ADMIN },
  { email: "gabriel@superadoratto.com.br", name: "Gabriel", role: Role.ADMIN },
  { email: "compras@superadoratto.com.br", name: "Wellington", role: Role.USER },
];

async function main() {
  // Step 0: Create or find the "Adoratto" tenant (idempotent)
  // tenantId is now required on users, so we must have a tenant before creating users.
  let tenant = await prisma.tenant.findFirst({ where: { name: "Adoratto" } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: "Adoratto" } });
    console.log(`Tenant created: ${tenant.id}`);
  } else {
    console.log(`Tenant already exists: ${tenant.id}`);
  }

  // Ensure tenant has default settings (idempotent)
  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      buyerSpendingLimit: 350000,
    },
  });
  console.log("  TenantSettings ensured");

  for (const user of users) {
    console.log(`Seeding ${user.email}...`);

    // Step 1: Create user in Supabase Auth.
    // We first try to find an existing user by email (for idempotency).
    // If found, we use their existing ID. If not, we create a new one.
    let authId: string;

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === user.email);

    if (existing) {
      authId = existing.id;
      console.log(`  Auth user already exists (${authId})`);
    } else {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: SEED_PASSWORD,
        email_confirm: true, // Skip email verification — these are internal users
      });

      if (error) {
        throw new Error(`Failed to create auth user ${user.email}: ${error.message}`);
      }

      authId = data.user.id;
      console.log(`  Auth user created (${authId})`);
    }

    // Step 2: Upsert the user in Prisma.
    // "Upsert" = update if exists, insert if not. This makes the script idempotent.
    await prisma.user.upsert({
      where: { id: authId },
      update: { name: user.name, role: user.role, email: user.email, tenantId: tenant.id },
      create: { id: authId, email: user.email, name: user.name, role: user.role, tenantId: tenant.id },
    });

    console.log(`  Prisma user upserted`);
  }

  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
