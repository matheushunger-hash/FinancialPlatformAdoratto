import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Why a singleton? In development, Next.js hot-reloads your code frequently.
// Each hot-reload would normally create a NEW database connection. After a few
// reloads you'd have dozens of open connections and the database would refuse
// new ones. The singleton pattern stores the client on the global object
// (which survives hot-reloads) so only one connection ever exists.

// Why a driver adapter? Prisma 7.x uses a JavaScript-based query compiler (WASM)
// instead of the old Rust binary. This new engine requires an explicit database
// driver adapter — here we use `@prisma/adapter-pg` with the `pg` driver.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // We use DIRECT_URL (port 5432) instead of DATABASE_URL (pooled, port 6543)
  // because the pg driver doesn't work with Supabase's connection pooler
  // (it causes "Tenant or user not found" errors).
  // In serverless (Vercel), each function instance gets its own pool.
  // Default max=10 is too many — keep it small to avoid exhausting
  // Supabase's connection limit across concurrent Lambda instances.
  const pool = new Pool({
    connectionString: process.env.DIRECT_URL,
    max: process.env.VERCEL ? 3 : 10,
  });
  pool.on("connect", (client) => {
    client.query("SET timezone = 'UTC'").catch((err) => {
      console.error("Failed to SET timezone on new connection:", err);
    });
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
