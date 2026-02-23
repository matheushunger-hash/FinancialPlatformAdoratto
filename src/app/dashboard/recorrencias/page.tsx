import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { RecurringView } from "@/components/recurring/recurring-view";

export const metadata: Metadata = {
  title: "Recorrências — Adoratto",
};

export default async function RecorrenciasPage() {
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
      <h1 className="text-2xl font-bold tracking-tight">
        Pagamentos Recorrentes
      </h1>
      <p className="mt-1 text-muted-foreground">
        Gerencie os templates de títulos que se repetem periodicamente.
      </p>
      <div className="mt-6">
        <RecurringView userRole={profile!.role} />
      </div>
    </div>
  );
}
