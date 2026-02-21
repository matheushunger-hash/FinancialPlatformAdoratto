import type { Metadata } from "next";
import { SuppliersView } from "@/components/suppliers/suppliers-view";

export const metadata: Metadata = {
  title: "Fornecedores — Adoratto",
};

export default function FornecedoresPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Fornecedores</h1>
      <p className="mt-1 text-muted-foreground">
        Gerencie os fornecedores da plataforma.
      </p>
      <div className="mt-6">
        <SuppliersView />
      </div>
    </div>
  );
}
