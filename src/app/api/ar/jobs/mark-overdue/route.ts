import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markOverdueTransactions } from "@/lib/ar/jobs/markOverdue";

/**
 * GET /api/ar/jobs/mark-overdue
 *
 * Cron endpoint that marks stale PENDING card transactions as OVERDUE.
 * Protected by CRON_SECRET — not user auth (system job, no session).
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
 */
export async function GET(request: Request) {
  // Fail-safe: reject if CRON_SECRET is not configured
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await markOverdueTransactions(prisma);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[mark-overdue] Job failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
