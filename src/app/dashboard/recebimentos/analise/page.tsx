import { Suspense } from "react";
import { BrandAnalyticsView } from "@/components/ar/brand-analytics-view";

export default function AnalisePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">
        Análise de Custos por Bandeira
      </h1>
      <p className="mt-1 text-muted-foreground">
        Compare taxas e prazos entre bandeiras de cartão.
      </p>
      <Suspense fallback={<div>Carregando...</div>}>
        <BrandAnalyticsView />
      </Suspense>
    </div>
  );
}
