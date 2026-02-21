import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { PayablesView } from "@/components/payables/payables-view";

export const metadata: Metadata = {
  title: "Contas a Pagar — Adoratto",
};

export default async function ContasAPagarPage() {
  // Fetch user role — needed for role-based status transitions (ADR-010)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { role: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar</h1>
      <p className="mt-1 text-muted-foreground">
        Gerencie os títulos e contas a pagar da plataforma.
      </p>
      <div className="mt-6">
        <PayablesView userRole={profile!.role} />
      </div>
    </div>
  );
}
