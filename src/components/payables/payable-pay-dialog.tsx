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
import { cn } from "@/lib/utils";

// =============================================================================
// PayablePayDialog — Mini-modal for capturing payment date (ADR-010)
// =============================================================================
// Opens when "Registrar Pagamento" is clicked in the table dropdown.
// The user picks a date (defaults to today) and confirms. The orchestrator
// then calls handleTransition(id, "pay", dateString).
// =============================================================================

interface PayablePayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (paidAt: string) => void; // yyyy-MM-dd
}

export function PayablePayDialog({
  open,
  onOpenChange,
  onConfirm,
}: PayablePayDialogProps) {
  // Default to today's date
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Reset to today when dialog opens
  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setSelectedDate(new Date());
    }
    onOpenChange(isOpen);
  }

  function handleConfirm() {
    // Format as yyyy-MM-dd for the API
    const dateString = format(selectedDate, "yyyy-MM-dd");
    onConfirm(dateString);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>
            Informe a data em que o pagamento foi realizado.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) setSelectedDate(date);
                }}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
