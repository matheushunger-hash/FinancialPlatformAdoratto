import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// =============================================================================
// Centralized Auth Context
// =============================================================================
// Replaces the 6-8 lines of auth boilerplate that was duplicated in every API
// route. One call gives you everything you need: who the user is (userId),
// what org they belong to (tenantId), and what they can do (role).
//
// Usage in API routes:
//   const ctx = await getAuthContext();
//   if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
// =============================================================================

export interface AuthContext {
  userId: string; // For audit trail (createdBy, approvedBy)
  tenantId: string; // For data scoping (all read/write queries)
  role: string; // For permission checks (ADMIN vs USER)
}

export async function getAuthContext(): Promise<AuthContext | null> {
  // Step 1: Verify the user is logged in via Supabase Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Step 2: Fetch their profile to get tenantId and role
  // We use select to only fetch the two fields we need (not the whole user row)
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { tenantId: true, role: true },
  });

  if (!profile || !profile.tenantId) return null;

  return {
    userId: user.id,
    tenantId: profile.tenantId,
    role: profile.role,
  };
}
