import type { Metadata } from "next";
import { PayablesView } from "@/components/payables/payables-view";

export const metadata: Metadata = {
  title: "Contas a Pagar — Adoratto",
};

export default function ContasAPagarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar</h1>
      <p className="mt-1 text-muted-foreground">
        Gerencie os títulos e contas a pagar da plataforma.
      </p>
      <div className="mt-6">
        <PayablesView />
      </div>
    </div>
  );
}
