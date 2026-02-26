import { Suspense } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { TransactionsView } from "@/components/ar/transactions-view";

export default async function RecebimentosTransacoesPage() {
  const ctx = await getAuthContext();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Transações</h1>
      <Suspense fallback={<div>Carregando...</div>}>
        <TransactionsView userRole={ctx?.role ?? "USER"} />
      </Suspense>
    </div>
  );
}
