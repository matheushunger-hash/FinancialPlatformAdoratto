import { Suspense } from "react";
import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard — Adoratto",
};

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">
        Visão geral da situação financeira.
      </p>
      <div className="mt-6">
        {/* Suspense required because DashboardView uses useSearchParams() */}
        <Suspense>
          <DashboardView />
        </Suspense>
      </div>
    </div>
  );
}
