import { PrismaClient } from "@prisma/client";

// Why a singleton? In development, Next.js hot-reloads your code frequently.
// Each hot-reload would normally create a NEW database connection. After a few
// reloads you'd have dozens of open connections and the database would refuse
// new ones. The singleton pattern stores the client on the global object
// (which survives hot-reloads) so only one connection ever exists.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
