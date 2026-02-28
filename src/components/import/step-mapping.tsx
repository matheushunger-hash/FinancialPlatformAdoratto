"use client";

import { useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ColumnMapping,
  ImportDefaults,
  RawRow,
  TargetFieldKey,
} from "@/lib/import/types";
import { TARGET_FIELDS, REQUIRED_FIELDS } from "@/lib/import/types";

// =============================================================================
// Step 3: Mapping — Map spreadsheet columns to target fields
// =============================================================================
// Section A: Column mapping table — each spreadsheet column gets a dropdown to
// select which target field it maps to (or "Ignorar").
//
// Section B: Default values — for optional fields that aren't mapped, the user
// picks a default category and payment method.
//
// Smart defaults are pre-filled by autoMapColumns() from the orchestrator.
// =============================================================================

interface StepMappingProps {
  headers: string[];
  rows: RawRow[];
  mapping: ColumnMapping[];
  defaults: ImportDefaults;
  updateExisting: boolean;
  onMappingChange: (mapping: ColumnMapping[]) => void;
  onDefaultsChange: (defaults: ImportDefaults) => void;
  onUpdateExistingChange: (value: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export function StepMapping({
  headers,
  rows,
  mapping,
  defaults,
  updateExisting,
  onMappingChange,
  onDefaultsChange,
  onUpdateExistingChange,
  onBack,
  onConfirm,
}: StepMappingProps) {
  // Which fields are currently mapped — needed to disable already-used options
  const mappedFields = useMemo(() => {
    const set = new Set<string>();
    mapping.forEach((m) => {
      if (m.targetField !== "ignore") set.add(m.targetField);
    });
    return set;
  }, [mapping]);

  // Check which required fields are missing
  const missingRequired = useMemo(() => {
    return REQUIRED_FIELDS.filter((f) => !mappedFields.has(f));
  }, [mappedFields]);

  // Check for duplicate mappings (two columns → same target)
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    mapping.forEach((m) => {
      if (m.targetField !== "ignore") {
        counts.set(m.targetField, (counts.get(m.targetField) || 0) + 1);
      }
    });
    const dupes: string[] = [];
    counts.forEach((count, field) => {
      if (count > 1) dupes.push(field);
    });
    return dupes;
  }, [mapping]);

  // Get the first row as sample data
  const sampleRow = rows[0] || {};

  function handleFieldChange(index: number, value: string) {
    const updated = [...mapping];
    updated[index] = {
      ...updated[index],
      targetField: value as TargetFieldKey | "ignore",
    };
    onMappingChange(updated);
  }

  const canConfirm = missingRequired.length === 0 && duplicates.length === 0;

  return (
    <div className="space-y-6">
      {/* Section A: Column Mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapeamento de Colunas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Associe cada coluna da planilha ao campo correspondente no sistema.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Coluna da Planilha</TableHead>
                  <TableHead className="w-[250px]">Campo no Sistema</TableHead>
                  <TableHead>Valor de Exemplo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {headers.map((header, index) => {
                  const currentMapping = mapping[index];
                  const currentTarget = currentMapping?.targetField || "ignore";

                  return (
                    <TableRow key={header}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell>
                        <Select
                          value={currentTarget}
                          onValueChange={(v) => handleFieldChange(index, v)}
                        >
                          <SelectTrigger className="w-[220px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ignore">Ignorar</SelectItem>
                            {TARGET_FIELDS.map((field) => {
                              const isUsedElsewhere =
                                mappedFields.has(field.key) && currentTarget !== field.key;
                              return (
                                <SelectItem
                                  key={field.key}
                                  value={field.key}
                                  disabled={isUsedElsewhere}
                                >
                                  {field.label}
                                  {field.required ? " *" : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">
                        {sampleRow[header] != null ? String(sampleRow[header]) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Validation messages */}
          {missingRequired.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Campos obrigatórios não mapeados:{" "}
                {missingRequired
                  .map(
                    (f) =>
                      TARGET_FIELDS.find((t) => t.key === f)?.label || f,
                  )
                  .join(", ")}
              </span>
            </div>
          )}

          {duplicates.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Mapeamento duplicado:{" "}
                {duplicates
                  .map(
                    (f) =>
                      TARGET_FIELDS.find((t) => t.key === f)?.label || f,
                  )
                  .join(", ")}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B: Default Values */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Valores Padrão</CardTitle>
          <p className="text-sm text-muted-foreground">
            Aplicados quando a coluna não está mapeada ou o valor está vazio.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select
                value={defaults.category}
                onValueChange={(v) =>
                  onDefaultsChange({
                    ...defaults,
                    category: v as ImportDefaults["category"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="REVENDA">Revenda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Método de Pagamento</Label>
              <Select
                value={defaults.paymentMethod}
                onValueChange={(v) =>
                  onDefaultsChange({
                    ...defaults,
                    paymentMethod: v as ImportDefaults["paymentMethod"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                  <SelectItem value="CARTAO">Cartão</SelectItem>
                  <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="TAX_SLIP">Guia Tributária</SelectItem>
                  <SelectItem value="PAYROLL">Folha de Pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex items-start space-x-3">
            <Checkbox
              id="updateExisting"
              checked={updateExisting}
              onCheckedChange={(checked) =>
                onUpdateExistingChange(checked === true)
              }
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="updateExisting" className="cursor-pointer">
                Atualizar títulos existentes
              </Label>
              <p className="text-sm text-muted-foreground">
                Busca títulos pelo fornecedor + valor + vencimento e atualiza o
                status ao invés de criar duplicados.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onConfirm} disabled={!canConfirm}>
          Importar {rows.length} linhas
        </Button>
      </div>
    </div>
  );
}
