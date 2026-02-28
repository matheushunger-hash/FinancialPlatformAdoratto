import { Suspense } from "react";
import { ARDashboardView } from "@/components/ar/ar-dashboard-view";

export default function RecebimentosPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Recebimentos</h1>
      <p className="mt-1 text-muted-foreground">
        Visão geral dos recebíveis de cartão.
      </p>
      <Suspense fallback={<div>Carregando...</div>}>
        <ARDashboardView />
      </Suspense>
    </div>
  );
}
