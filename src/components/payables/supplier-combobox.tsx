"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatCNPJ,
  formatCPF,
} from "@/lib/suppliers/validation";

// =============================================================================
// SupplierCombobox — Searchable dropdown for selecting a supplier
// =============================================================================
// Uses the shadcn combobox pattern: Popover + Command (cmdk).
//
// On mount, fetches all suppliers from the API with a large pageSize (300).
// Filters out inactive suppliers client-side. cmdk handles the search
// filtering natively — no need for API calls on each keystroke.
//
// The document (CNPJ/CPF) is shown alongside the name so users can tell
// apart suppliers with similar names.
// =============================================================================

interface Supplier {
  id: string;
  name: string;
  documentType: "CNPJ" | "CPF";
  document: string;
  active: boolean;
}

interface SupplierComboboxProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SupplierCombobox({ value, onChange, disabled }: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all suppliers once on mount
  useEffect(() => {
    async function fetchSuppliers() {
      try {
        const res = await fetch("/api/suppliers?pageSize=300");
        if (!res.ok) return;
        const data = await res.json();
        // Filter to only active suppliers
        setSuppliers(
          data.suppliers.filter((s: Supplier) => s.active),
        );
      } catch {
        // Silently fail — the combobox will just be empty
      } finally {
        setLoading(false);
      }
    }
    fetchSuppliers();
  }, []);

  // Find the selected supplier to display its name in the button
  const selected = suppliers.find((s) => s.id === value);

  function formatDoc(s: Supplier) {
    return s.documentType === "CNPJ"
      ? formatCNPJ(s.document)
      : formatCPF(s.document);
  }

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.name : "Selecionar fornecedor..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={loading ? "Carregando..." : "Buscar fornecedor..."}
          />
          <CommandList>
            <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
            <CommandGroup>
              {suppliers.map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={`${supplier.name} ${formatDoc(supplier)}`}
                  onSelect={() => {
                    onChange(supplier.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === supplier.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{supplier.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {supplier.documentType}: {formatDoc(supplier)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
