import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { SupplierDetailView } from "@/components/suppliers/supplier-detail-view";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: "Detalhe do Fornecedor — Adoratto",
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 16: params is a Promise — must await before accessing
  const { id } = await params;

  // Validate UUID format — invalid IDs get a clean 404
  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  // Fetch user role — needed for role-based actions in the payables table (same as contas-a-pagar)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { role: true },
  });

  return <SupplierDetailView supplierId={id} userRole={profile!.role} />;
}
