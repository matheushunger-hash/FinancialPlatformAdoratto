"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  FileText,
  Mail,
  Pencil,
  Phone,
  User,
  Landmark,
  QrCode,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCNPJ, formatCPF } from "@/lib/suppliers/validation";
import type { SupplierListItem } from "@/lib/suppliers/types";

// =============================================================================
// SupplierInfoCard — Displays supplier profile information
// =============================================================================
// Presentational component: receives data, renders it. No state, no fetching.
// Shows: name, status badge, trade name, document, contact info, bank info, notes.
// =============================================================================

interface SupplierInfoCardProps {
  supplier: SupplierListItem | null;
  loading: boolean;
  onEdit: () => void;
}

// --- Helper: info row with icon ---
function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

export function SupplierInfoCard({ supplier, loading, onEdit }: SupplierInfoCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-14" />
          </div>
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!supplier) return null;

  const formattedDocument =
    supplier.documentType === "CNPJ"
      ? formatCNPJ(supplier.document)
      : formatCPF(supplier.document);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Header: back arrow, name, badge, edit button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/dashboard/fornecedores">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Voltar</span>
              </Link>
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{supplier.name}</h1>
            <Badge variant={supplier.active ? "default" : "secondary"}>
              {supplier.active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </div>

        {/* Trade name (if present) */}
        {supplier.tradeName && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {supplier.tradeName}
          </p>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <InfoRow
            icon={FileText}
            label={supplier.documentType}
            value={formattedDocument}
          />
          <InfoRow icon={Mail} label="E-mail" value={supplier.email} />
          <InfoRow icon={Phone} label="Telefone" value={supplier.phone} />
          <InfoRow icon={User} label="Contato" value={supplier.contactName} />
          <InfoRow
            icon={Landmark}
            label="Banco"
            value={
              supplier.bankName
                ? `${supplier.bankName}${supplier.bankAgency ? ` — Ag: ${supplier.bankAgency}` : ""}${supplier.bankAccount ? ` — CC: ${supplier.bankAccount}` : ""}`
                : null
            }
          />
          <InfoRow icon={QrCode} label="Chave PIX" value={supplier.pixKey} />
        </div>

        {/* Notes */}
        {supplier.notes && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">Observações</p>
            <p className="text-sm whitespace-pre-wrap">{supplier.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
