"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UpcomingDay } from "@/lib/ar/types";

// =============================================================================
// Upcoming Receivables — 7-day summary table (#70)
// =============================================================================
// Shows the next 7 days of expected receivables grouped by date.
// Clicking a row navigates to the transactions page filtered to that date.
// =============================================================================

interface UpcomingReceivablesProps {
  data: UpcomingDay[] | null;
  loading: boolean;
}

function formatBRL(value: string): string {
  const num = Number(value);
  if (isNaN(num)) return value;
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function UpcomingReceivables({ data, loading }: UpcomingReceivablesProps) {
  const router = useRouter();

  function handleRowClick(dateStr: string) {
    router.push(`/dashboard/recebimentos/transacoes?from=${dateStr}&to=${dateStr}`);
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />
          Próximos Recebimentos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Loading state */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && (!data || data.length === 0) && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum recebimento previsto nos próximos 7 dias.
          </p>
        )}

        {/* Table */}
        {!loading && data && data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Transações</TableHead>
                <TableHead className="text-right">Valor Líquido</TableHead>
                <TableHead className="hidden sm:table-cell">Bandeira Principal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((day) => {
                const date = new Date(day.date + "T12:00:00");
                const dayLabel = format(date, "EEEE", { locale: ptBR });
                const dateFormatted = format(date, "dd/MM/yyyy");
                // Capitalize first letter of day name
                const dayCapitalized = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

                return (
                  <TableRow
                    key={day.date}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => handleRowClick(day.date)}
                  >
                    <TableCell>
                      <div>
                        <span className="font-medium">{dateFormatted}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {dayCapitalized}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{day.count}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatBRL(day.netAmount)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {day.topBrand}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
