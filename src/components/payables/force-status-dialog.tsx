"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// =============================================================================
// ForceStatusDialog — ADMIN override to set any status on a payable
// =============================================================================
// Opens when "Alterar Status" is clicked in the dropdown. The admin picks
// a target status from a select. If PAID is chosen, a date picker appears.
// =============================================================================

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pendente" },
  { value: "APPROVED", label: "Aprovado" },
  { value: "REJECTED", label: "Rejeitado" },
  { value: "PAID", label: "Pago" },
  { value: "OVERDUE", label: "Vencido" },
  { value: "CANCELLED", label: "Cancelado" },
] as const;

interface ForceStatusDialogProps {
  open: boolean;
  currentStatus: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (targetStatus: string, paidAt?: string) => void;
}

export function ForceStatusDialog({
  open,
  currentStatus,
  onOpenChange,
  onConfirm,
}: ForceStatusDialogProps) {
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [paidAtDate, setPaidAtDate] = useState<Date>(new Date());

  // Filter out the current status so admin only sees valid targets
  const normalizedCurrent = currentStatus.toUpperCase();
  const availableOptions = STATUS_OPTIONS.filter(
    (opt) => opt.value !== normalizedCurrent,
  );

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setTargetStatus("");
      setPaidAtDate(new Date());
    }
    onOpenChange(isOpen);
  }

  function handleConfirm() {
    if (!targetStatus) return;
    if (targetStatus === "PAID") {
      onConfirm(targetStatus, format(paidAtDate, "yyyy-MM-dd"));
    } else {
      onConfirm(targetStatus);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Status</DialogTitle>
          <DialogDescription>
            Selecione o novo status para este título. Esta ação é um override
            administrativo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status selector */}
          <Select value={targetStatus} onValueChange={setTargetStatus}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o status..." />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date picker — only shown when target is PAID */}
          {targetStatus === "PAID" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Data de pagamento</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !paidAtDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(paidAtDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paidAtDate}
                    onSelect={(date) => {
                      if (date) setPaidAtDate(date);
                    }}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!targetStatus}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
