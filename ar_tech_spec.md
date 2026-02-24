# Technical Specification — Módulo de Contas a Receber (AR)
**FinancialPlatformAdoratto · v1.0 · Fevereiro 2026**
**Referência:** PRD — Módulo AR v1.0

---

## 1. Visão de Arquitetura

### 1.1 Princípios Arquiteturais

- **Import-first, Automate-later:** a plataforma começa consumindo o arquivo .xlsx do RPInfo Flex via upload manual. Automação de ingestão vem na Fase 4, sem mudar o modelo de dados.
- **Imutabilidade dos dados de origem:** registros importados nunca têm seus valores originais alterados. Toda conciliação e correção ocorre em tabelas separadas via event sourcing leve.
- **Schema-first:** o contrato de dados (Prisma schema) é a fonte de verdade. Migrações são versionadas e nunca destrutivas.
- **Single source of truth para fluxo de caixa:** toda projeção de caixa AR é derivada das tabelas transacionais — sem planilhas paralelas.
- **Modularidade:** o módulo AR é independente do módulo AP, mas ambos expõem interfaces compatíveis para o dashboard unificado de fluxo de caixa futuro.

### 1.2 Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Server components + client interactivity; já em uso na plataforma |
| UI Components | shadcn/ui + Tailwind CSS | Consistência visual, acessibilidade |
| Gráficos | Recharts | Leve, composable, integra nativamente com React |
| Backend / API | Next.js API Routes (Node.js) | Monorepo simplificado; sem overhead de serviço separado |
| ORM | Prisma | Type-safety end-to-end, migrações versionadas |
| Banco de dados | PostgreSQL 15+ | ACID, JSONB, excelente para queries financeiras |
| Parse de XLSX | xlsx (SheetJS) | Biblioteca líder para leitura de .xlsx no Node.js |
| Upload de arquivos | Formidable + Next.js | Streaming de arquivos sem bufferizar em memória |
| Autenticação | NextAuth.js | Múltiplos providers, sessão segura, RBAC extensível |
| Validação | Zod | Schema validation type-safe compartilhado entre frontend e backend |
| Testes | Vitest + Testing Library | Rápido, compatível com TypeScript |
| CI/CD | GitHub Actions | Pipeline lint + test + build automático a cada PR |

### 1.3 Diagrama de Camadas

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER / MOBILE                     │
│  Dashboard  │  Upload  │  Conciliação  │  Relatórios    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / Next.js SSR
┌────────────────────────▼────────────────────────────────┐
│                  NEXT.JS APP (Vercel / VPS)             │
│  App Router (RSC)  │  API Routes  │  Server Actions      │
│  /app/ar/*         │  /api/ar/*   │  import, receipt    │
└────────────────────────┬────────────────────────────────┘
                         │ Prisma Client
┌────────────────────────▼────────────────────────────────┐
│              POSTGRESQL (Supabase / self-hosted)        │
│  card_transactions │ import_batches │ payment_receipts  │
│  audit_log         │ users          │ (AP tables — sep) │
└─────────────────────────────────────────────────────────┘
                         ▲
          RPInfo Flex XLSX export (upload manual)
```

---

## 2. Schema do Banco de Dados

### 2.1 Schema Prisma Completo

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Usuários ────────────────────────────────────────────
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  name          String
  role          UserRole  @default(OPERATOR)
  passwordHash  String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  importBatches  ImportBatch[]
  receipts       PaymentReceipt[]
  auditLogs      AuditLog[]
}

enum UserRole { OPERATOR  MANAGER  ADMIN }

// ── Lotes de Importação ──────────────────────────────────
model ImportBatch {
  id            Int       @id @default(autoincrement())
  importedById  Int
  importedAt    DateTime  @default(now())
  filename      String
  totalRows     Int
  acceptedRows  Int
  rejectedRows  Int
  grossTotal    Decimal   @db.Decimal(12, 2)
  netTotal      Decimal   @db.Decimal(12, 2)
  dateFrom      DateTime  @db.Date
  dateTo        DateTime  @db.Date

  importedBy    User                @relation(fields: [importedById], references: [id])
  transactions  CardTransaction[]
}

// ── Transações de Cartão (core AR) ───────────────────────
model CardTransaction {
  id                  Int               @id @default(autoincrement())
  transactionId       String            @unique  // "Código" do RPInfo
  importBatchId       Int
  transactionDate     DateTime          @db.Date
  expectedPaymentDate DateTime          @db.Date
  brand               String            // Bandeira
  acquirer            String            // Autorizador
  modality            String            // Modalidade
  grossAmount         Decimal           @db.Decimal(12, 2)
  netAmount           Decimal           @db.Decimal(12, 2)
  feeAmount           Decimal           @db.Decimal(12, 2)
  feePct              Decimal           @db.Decimal(6, 4)
  nsu                 String
  unitCode            String
  unitName            String
  installment         Int               @default(1)
  totalInstallments   Int               @default(1)
  status              TransactionStatus @default(PENDING)
  createdAt           DateTime          @default(now())

  importBatch  ImportBatch      @relation(fields: [importBatchId], references: [id])
  receipts     PaymentReceipt[]

  @@index([expectedPaymentDate])
  @@index([status])
  @@index([brand])
  @@index([transactionDate])
}

enum TransactionStatus {
  PENDING    // Importado, depósito não ocorreu
  CONFIRMED  // Depósito registrado, valor confere
  DIVERGENT  // Depósito registrado, valor difere
  OVERDUE    // Data passou, sem registro de depósito
  CANCELLED  // Transação cancelada/estornada
}

// ── Recebimentos Registrados ─────────────────────────────
model PaymentReceipt {
  id                 Int      @id @default(autoincrement())
  transactionId      Int
  receivedAt         DateTime @db.Date
  receivedAmount     Decimal  @db.Decimal(12, 2)
  divergence         Decimal  @db.Decimal(12, 2)  // netAmount - receivedAmount
  registeredById     Int
  notes              String?
  createdAt          DateTime @default(now())

  transaction    CardTransaction @relation(fields: [transactionId], references: [id])
  registeredBy   User            @relation(fields: [registeredById], references: [id])
}

// ── Audit Log ────────────────────────────────────────────
model AuditLog {
  id         Int      @id @default(autoincrement())
  userId     Int
  action     String   // "IMPORT_BATCH" | "CONFIRM_RECEIPT" | "MARK_DIVERGENT" ...
  entityType String   // "CardTransaction" | "ImportBatch"
  entityId   Int
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
}
```

### 2.2 Índices e Performance

| Query | Índice utilizado | Frequência |
|---|---|---|
| Recebíveis pendentes por data de pagamento | idx(expectedPaymentDate, status) | Alta — dashboard principal |
| Todas transações de um lote | idx(importBatchId) | Alta — pós-importação |
| Filtro por bandeira + período | idx(brand, transactionDate) | Média — análise de custos |
| Transações vencidas (status=OVERDUE) | idx(status) | Média — job diário |
| Audit trail de uma entidade | idx(entityType, entityId) | Baixa — rastreabilidade |

---

## 3. Especificação de API

### 3.1 Convenções

- Base path: `/api/ar/`
- Autenticação: Bearer token (JWT via NextAuth) em todas as rotas
- OPERATOR: pode ler e criar recebimentos. MANAGER: acesso total.
- Respostas seguem envelope padrão: `{ data, meta, error }`
- Paginação via cursor: `{ cursor, limit }` — não page/offset
- Datas sempre em ISO 8601 (YYYY-MM-DD para datas)
- Valores monetários sempre em Decimal string (evitar floating point)

### 3.2 POST /api/ar/import

Recebe o arquivo .xlsx via `multipart/form-data`, processa e persiste.

```typescript
// Request: multipart/form-data
// Field: file (File) — arquivo .xlsx

// Response 200
{
  "data": {
    "batchId": 42,
    "totalRows": 1887,
    "acceptedRows": 1885,
    "rejectedRows": 2,
    "grossTotal": "94339.03",
    "netTotal": "90480.38",
    "dateFrom": "2026-01-18",
    "dateTo": "2026-02-21",
    "rejectedItems": [
      { "row": 145, "reason": "transactionId duplicado: 851800" }
    ]
  }
}

// Response 409 — lote duplicado detectado
{
  "error": {
    "code": "DUPLICATE_BATCH",
    "message": "Arquivo com mesmo período já importado (batch #38)",
    "existingBatchId": 38
  }
}
```

### 3.3 GET /api/ar/import/batches

```typescript
// Query params: ?limit=20&cursor=<batchId>
// Response 200
{
  "data": [
    {
      "id": 42,
      "filename": "pending_1771798079591.xlsx",
      "importedAt": "2026-02-22T14:30:00Z",
      "importedBy": { "id": 1, "name": "Ana Financeiro" },
      "acceptedRows": 1885,
      "netTotal": "90480.38",
      "dateFrom": "2026-01-18",
      "dateTo": "2026-02-21"
    }
  ],
  "meta": { "nextCursor": 21, "hasMore": true }
}
```

### 3.4 GET /api/ar/transactions

```typescript
// Query params:
//   status: PENDING | CONFIRMED | DIVERGENT | OVERDUE | CANCELLED
//   brand: string
//   acquirer: string
//   from: YYYY-MM-DD  (expectedPaymentDate)
//   to: YYYY-MM-DD
//   limit: number (default: 50, max: 200)
//   cursor: number (transactionId)

// Response 200
{
  "data": [
    {
      "id": 1,
      "transactionId": "851761",
      "transactionDate": "2026-01-19",
      "expectedPaymentDate": "2026-02-25",
      "brand": "Ticket Alimentação",
      "acquirer": "Ticket",
      "grossAmount": "21.38",
      "netAmount": "20.10",
      "feeAmount": "1.28",
      "feePct": "5.99",
      "status": "PENDING",
      "receipt": null
    }
  ],
  "meta": {
    "total": 1887,
    "netTotal": "90480.38",
    "nextCursor": 52,
    "hasMore": true
  }
}
```

### 3.5 POST /api/ar/receipts

```typescript
// Request body
{
  "transactionId": 1,
  "receivedAt": "2026-02-25",
  "receivedAmount": "20.10",
  "notes": "Depósito Safrapay ref. lote 523"
}

// Response 200 — valor confere
{
  "data": {
    "receiptId": 101,
    "transactionId": 1,
    "divergence": "0.00",
    "newStatus": "CONFIRMED"
  }
}

// Response 200 — divergência detectada
{
  "data": {
    "receiptId": 102,
    "transactionId": 2,
    "divergence": "-1.45",
    "newStatus": "DIVERGENT"
  }
}
```

### 3.6 GET /api/ar/dashboard/summary

```typescript
// Response 200
{
  "data": {
    "totalPending":     { "amount": "90480.38", "count": 1885 },
    "receivableToday":  { "amount": "65795.95", "count": 1241 },
    "next7Days":        { "amount": "90480.38", "count": 1885 },
    "feesThisMonth":    { "amount": "3858.65",  "avgPct": "4.09" },
    "overdueCount":     12,
    "weekOverWeekPct":  "+3.2"
  }
}
```

### 3.7 GET /api/ar/dashboard/calendar

```typescript
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Response 200
{
  "data": [
    {
      "date": "2026-02-23",
      "pendingAmount": "65795.95",
      "confirmedAmount": "0.00",
      "transactionCount": 1241,
      "byBrand": [
        { "brand": "Mastercard", "netAmount": "25000.00", "count": 420 },
        { "brand": "Visa",       "netAmount": "18000.00", "count": 310 }
      ]
    }
  ]
}
```

### 3.8 GET /api/ar/dashboard/cashflow

```typescript
// Query params: ?horizon=30 (dias à frente)
// Response 200
{
  "data": {
    "projectedInflows": [
      { "date": "2026-02-23", "expected": "65795.95", "confirmed": "0.00" },
      { "date": "2026-02-24", "expected": "2100.50",  "confirmed": "0.00" }
    ],
    "overdueAtRisk": "0.00",
    "totalProjected30d": "90480.38"
  }
}
```

### 3.9 GET /api/ar/analytics/brands

```typescript
// Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Response 200
{
  "data": [
    {
      "brand": "Mastercard",
      "grossAmount": "31871.10",
      "netAmount": "30967.10",
      "feeAmount": "904.00",
      "avgFeePct": "2.83",
      "avgSettlementDays": 2.4,
      "transactionCount": 520
    },
    {
      "brand": "VR Beneficios",
      "grossAmount": "6812.09",
      "netAmount": "6345.46",
      "feeAmount": "466.63",
      "avgFeePct": "6.85",
      "avgSettlementDays": 31.2,
      "transactionCount": 89
    }
  ]
}
```

---

## 4. Pipeline de Importação do Arquivo

### 4.1 Fluxo de Processamento

```
Upload (.xlsx)  →  Validação estrutural  →  Parse linha a linha
                                                    ↓
                                        Validação por linha
                                        (campos obrig., tipos)
                                                    ↓
                                       Detecção de duplicatas
                                       (transactionId já existe?)
                                                    ↓
                                        Transação DB (atomic)
                                        INSERT import_batch
                                        INSERT card_transactions
                                        INSERT audit_log
                                                    ↓
                                        Retorna resumo ao cliente
```

### 4.2 Implementação do Parser

```typescript
// lib/ar/importParser.ts

import * as XLSX from "xlsx";
import { z } from "zod";

const HEADER_ROW = 5; // linha 6, índice 5 (baseado no arquivo real)

const TransactionRowSchema = z.object({
  "Código":           z.string().min(1),
  "Bandeira":         z.string().min(1),
  "Autorizador":      z.string(),
  "Modalidade":       z.string(),
  "Status":           z.string(),
  "Data Transação":   z.coerce.date(),
  "Data Pagamento":   z.coerce.date(),
  "Valor Bruto":      z.coerce.number().positive(),
  "Valor Liquido":    z.coerce.number().positive(),
  "Taxa Adm.":        z.coerce.number().min(0),
  "Perc. Taxa Adm.":  z.coerce.number().min(0),
  "NSU":              z.coerce.string(),
  "Parcela":          z.coerce.number().default(1),
  "Total Parcelas":   z.coerce.number().default(1),
  "Cod. Flex. Unid.": z.coerce.string(),
  "Nome da Unidade":  z.string(),
});

export type ParseResult = {
  accepted: ParsedTransaction[];
  rejected: { row: number; reason: string }[];
  meta: { grossTotal: number; netTotal: number; dateFrom: Date; dateTo: Date };
};

export function parseImportFile(buffer: Buffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

  const headers = rows[HEADER_ROW] as string[];
  const dataRows = rows.slice(HEADER_ROW + 1);

  const accepted: ParsedTransaction[] = [];
  const rejected: { row: number; reason: string }[] = [];

  dataRows.forEach((row, idx) => {
    if (!row || row.every(cell => cell === null || cell === "")) return;

    const obj = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
    const result = TransactionRowSchema.safeParse(obj);

    if (!result.success) {
      rejected.push({
        row: idx + HEADER_ROW + 2,
        reason: result.error.issues[0].message
      });
      return;
    }

    accepted.push(mapToTransaction(result.data));
  });

  return { accepted, rejected, meta: computeMeta(accepted) };
}
```

### 4.3 Estratégia de Upsert e Detecção de Duplicatas

```typescript
// lib/ar/importService.ts

export async function persistBatch(
  parsed: ParseResult,
  userId: number,
  filename: string
) {
  // 1. Verifica sobreposição de período
  const overlap = await prisma.importBatch.findFirst({
    where: {
      dateFrom: { lte: parsed.meta.dateTo },
      dateTo:   { gte: parsed.meta.dateFrom },
    }
  });
  if (overlap) throw new DuplicateBatchError(overlap.id);

  // 2. Verifica transactionIds já existentes
  const ids = parsed.accepted.map(t => t.transactionId);
  const existing = await prisma.cardTransaction.findMany({
    where: { transactionId: { in: ids } },
    select: { transactionId: true }
  });
  const existingSet = new Set(existing.map(e => e.transactionId));

  const toInsert = parsed.accepted.filter(t => !existingSet.has(t.transactionId));
  const duplicates = parsed.accepted
    .filter(t => existingSet.has(t.transactionId))
    .map(t => ({ row: t._row, reason: `transactionId duplicado: ${t.transactionId}` }));

  // 3. Atomic transaction
  return await prisma.$transaction(async (tx) => {
    const batch = await tx.importBatch.create({
      data: {
        importedById: userId,
        filename,
        totalRows: parsed.accepted.length + parsed.rejected.length,
        acceptedRows: toInsert.length,
        rejectedRows: parsed.rejected.length + duplicates.length,
        grossTotal: parsed.meta.grossTotal,
        netTotal:   parsed.meta.netTotal,
        dateFrom:   parsed.meta.dateFrom,
        dateTo:     parsed.meta.dateTo,
      }
    });

    await tx.cardTransaction.createMany({
      data: toInsert.map(t => ({ ...t, importBatchId: batch.id })),
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "IMPORT_BATCH",
        entityType: "ImportBatch",
        entityId: batch.id,
        after: { acceptedRows: toInsert.length },
      }
    });

    return { batch, rejected: [...parsed.rejected, ...duplicates] };
  });
}
```

---

## 5. Jobs e Automações

### 5.1 Job: Detectar Transações Vencidas

Roda diariamente às 08:00 BRT (11:00 UTC). Marca como OVERDUE todas as transações PENDING com `expectedPaymentDate < hoje`.

```typescript
// jobs/markOverdue.ts

export async function markOverdueTransactions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.cardTransaction.updateMany({
    where: {
      status: "PENDING",
      expectedPaymentDate: { lt: today }
    },
    data: { status: "OVERDUE" }
  });

  await prisma.auditLog.create({
    data: {
      userId: SYSTEM_USER_ID,
      action: "AUTO_MARK_OVERDUE",
      entityType: "CardTransaction",
      entityId: 0,
      after: { count: result.count, runAt: new Date().toISOString() }
    }
  });

  return result.count;
}
```

### 5.2 Agendamento

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/ar/jobs/mark-overdue",
      "schedule": "0 11 * * *"
    }
  ]
}
```

Endpoint protegido por `CRON_SECRET` no header `Authorization`.

---

## 6. Arquitetura de Frontend

### 6.1 Estrutura de Rotas (Next.js App Router)

```
app/
├── (auth)/
│   └── login/page.tsx
├── ar/                          ← módulo AR
│   ├── layout.tsx               ← sidebar + header compartilhados
│   ├── page.tsx                 ← Dashboard principal
│   ├── import/
│   │   └── page.tsx             ← Upload + histórico de lotes
│   ├── transactions/
│   │   ├── page.tsx             ← Lista de recebíveis
│   │   └── [id]/page.tsx        ← Detalhe da transação
│   ├── receipts/
│   │   └── page.tsx             ← Registrar baixa
│   ├── analytics/
│   │   ├── brands/page.tsx      ← Análise por bandeira
│   │   └── cashflow/page.tsx    ← Projeção de fluxo de caixa
│   └── reports/
│       └── page.tsx             ← Exportação de relatórios
├── api/
│   └── ar/
│       ├── import/route.ts
│       ├── transactions/route.ts
│       ├── receipts/route.ts
│       ├── dashboard/summary/route.ts
│       ├── dashboard/calendar/route.ts
│       ├── dashboard/cashflow/route.ts
│       ├── analytics/brands/route.ts
│       └── jobs/mark-overdue/route.ts
lib/
├── ar/
│   ├── importParser.ts
│   ├── importService.ts
│   ├── transactionService.ts
│   └── dashboardService.ts
prisma/
├── schema.prisma
└── migrations/
```

### 6.2 Componentes Principais

| Componente | Localização | Responsabilidade |
|---|---|---|
| `<ARDashboard />` | ar/page.tsx | Página principal com KPI cards + calendário + tabela resumo |
| `<KPICard />` | components/ar/KPICard.tsx | Card de métrica com valor, label, tendência e sparkline |
| `<ReceivableCalendar />` | components/ar/ReceivableCalendar.tsx | Linha do tempo 7/30 dias com barras por dia |
| `<TransactionTable />` | components/ar/TransactionTable.tsx | Tabela paginada com filtros, sort e ação de baixa inline |
| `<ImportDropzone />` | components/ar/ImportDropzone.tsx | Drag & drop .xlsx com preview de resumo pré-confirmação |
| `<ImportSummaryModal />` | components/ar/ImportSummaryModal.tsx | Modal pós-import: aceitos, rejeitados, totais |
| `<ReceiptModal />` | components/ar/ReceiptModal.tsx | Form de baixa: data, valor recebido, observação |
| `<BrandAnalyticsTable />` | components/ar/BrandAnalyticsTable.tsx | Tabela comparativa de bandeiras |
| `<CashflowChart />` | components/ar/CashflowChart.tsx | Area chart previsto vs. realizado (Recharts AreaChart) |

### 6.3 State Management

- **Server Components** para leitura de dados (dashboard, listas) — zero JS no cliente para fetching.
- **Client Components** apenas para interações: upload, modais, filtros dinâmicos, gráficos.
- **React Query (TanStack Query)** para client-side data fetching em componentes interativos.
- **react-hook-form + Zod** para formulários — validação compartilhada com o backend.
- Sem Redux ou Zustand — escopo não justifica.

### 6.4 Upload de Arquivo — Fluxo UX

```
1. Usuário arrasta .xlsx ou clica em "Selecionar arquivo"
   → Validação client-side: extensão .xlsx, tamanho < 10MB

2. Exibe preview do arquivo selecionado (nome + tamanho)
   → Botão "Importar" habilitado

3. POST /api/ar/import (multipart)
   → Loading state com progress indicator

4a. Sucesso → Modal ImportSummaryModal com:
    - Linha do tempo do arquivo (dateFrom → dateTo)
    - Total aceitos / rejeitados com razões
    - Valor líquido total do lote
    - Botão "Ver recebíveis importados" → /ar/transactions?batchId=X

4b. Duplicata detectada (409) → Alert com link para o lote existente

4c. Erro de parsing → Lista de linhas com problema + razão
```

---

## 7. Segurança e Controle de Acesso

### 7.1 Roles e Permissões

| Ação | OPERATOR | MANAGER | ADMIN |
|---|---|---|---|
| Ver dashboard | ✓ | ✓ | ✓ |
| Ver lista de transações | ✓ | ✓ | ✓ |
| Fazer upload de arquivo | ✓ | ✓ | ✓ |
| Registrar baixa (recebimento) | ✓ | ✓ | ✓ |
| Cancelar uma transação | ✗ | ✓ | ✓ |
| Exportar relatórios | ✓ | ✓ | ✓ |
| Ver audit log | ✗ | ✓ | ✓ |
| Gerenciar usuários | ✗ | ✗ | ✓ |
| Configurar alertas e thresholds | ✗ | ✓ | ✓ |

### 7.2 Proteção das Rotas de API

```typescript
// middleware.ts (Next.js)

import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

export const config = {
  matcher: ["/ar/:path*", "/api/ar/:path*"],
};

// Verificação de role nas rotas sensíveis
export async function requireRole(req: NextRequest, minRole: UserRole) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
  if (!hasRole(session.user.role, minRole)) return forbidden();
}
```

### 7.3 Validação de Upload

- Extensão: somente `.xlsx` aceito (verificação de MIME type + extensão).
- Tamanho máximo: 10MB.
- Parsing sempre em memória isolada — sem execução de macros (SheetJS não executa código).
- Sanitização via Prisma parametrizado — sem SQL injection.

---

## 8. Estratégia de Testes

### 8.1 Pirâmide de Testes

| Nível | Ferramenta | O que cobrir | Meta |
|---|---|---|---|
| Unit | Vitest | importParser.ts: parsing válido/inválido; cálculo de divergência; detecção de duplicatas | > 90% |
| Integration | Vitest + Prisma test db | persistBatch: transação atômica, rollback; markOverdue: lógica de status | > 80% |
| API | Supertest | POST /import, GET /transactions, POST /receipts — happy path + casos de erro | > 80% |
| E2E | Playwright | Fluxo completo: upload → visualizar → dar baixa. Smoke test no CI. | Fluxos críticos |

### 8.2 Casos de Teste Críticos — Parser

```typescript
// __tests__/importParser.test.ts

describe("parseImportFile", () => {
  it("parseia arquivo real com 1887 linhas sem rejeições", () => {
    const result = parseImportFile(realFileBuffer);
    expect(result.accepted).toHaveLength(1887);
    expect(result.rejected).toHaveLength(0);
    expect(result.meta.grossTotal).toBeCloseTo(94339.03, 2);
    expect(result.meta.netTotal).toBeCloseTo(90480.38, 2);
  });

  it("rejeita linhas com Código vazio", () => {
    const result = parseImportFile(fileWithEmptyCodigo);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toMatch(/Código/);
  });

  it("calcula corretamente a janela de liquidação por bandeira", () => {
    const result = parseImportFile(realFileBuffer);
    const ticket = result.accepted.filter(t => t.brand === "Ticket Alimentação");
    const avgDays = ticket.reduce((s, t) =>
      s + daysBetween(t.transactionDate, t.expectedPaymentDate), 0) / ticket.length;
    expect(avgDays).toBeCloseTo(34, 0);
  });

  it("detecta e rejeita transactionId duplicado no mesmo arquivo", () => {
    const result = parseImportFile(fileWithDuplicateId);
    expect(result.rejected.some(r => r.reason.includes("duplicado"))).toBe(true);
  });
});
```

---

## 9. Migrations e Deploy

### 9.1 Convenção de Migrations

- Nome descritivo: `YYYYMMDD_descricao` (ex: `20260222_create_ar_module`)
- Migrations aditivas — nunca `DROP` sem período de deprecation documentado
- Toda migration passa pelo CI antes de produção

### 9.2 Sequência de Migration Inicial

```bash
# 1. Criar migration
npx prisma migrate dev --name create_ar_module

# 2. Aplicar em staging
DATABASE_URL=$STAGING_URL npx prisma migrate deploy

# 3. Smoke test em staging
npm run test:e2e -- --env=staging

# 4. Aplicar em produção
DATABASE_URL=$PROD_URL npx prisma migrate deploy
```

### 9.3 Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|---|---|---|
| `DATABASE_URL` | Connection string PostgreSQL | Sim |
| `NEXTAUTH_SECRET` | Secret para assinar JWTs | Sim |
| `NEXTAUTH_URL` | URL base da aplicação | Sim |
| `CRON_SECRET` | API key para proteção dos endpoints de jobs | Sim |
| `MAX_UPLOAD_SIZE_MB` | Tamanho máximo de upload (default: 10) | Não |
| `AR_OVERDUE_JOB_HOUR_UTC` | Hora UTC para rodar o job de overdue (default: 11) | Não |

---

## 10. Preview — Fase 4: Automação

> Esta seção orienta decisões de arquitetura nas fases anteriores. Nenhuma implementação necessária agora.

### 10.1 Import Automático via Pasta Monitorada

```typescript
// Opção A: chokidar (file watcher local)
import chokidar from "chokidar";

chokidar.watch("/srv/rpinfo/exports/*.xlsx")
  .on("add", (path) => triggerImport(path));

// Opção B: S3 / object storage
// RPInfo exporta para bucket S3 → Lambda trigger → POST /api/ar/import
```

### 10.2 Conciliação Semi-automática via OFX

```
// Algoritmo de matching
// Para cada crédito no extrato bancário (OFX):

1. Busca transações com expectedPaymentDate ± 2 dias
   E netAmount ≈ creditAmount (tolerância: R$ 0,10)
   E status = PENDING

2. Se 1 match  → propõe como "alta confiança" (pode auto-confirmar)
3. Se N matches → propõe lista para seleção manual
4. Se 0 matches → marca como "crédito não identificado"

// O operador revisa os de baixa/média confiança
// O modelo de dados já suporta isso — PaymentReceipt aceita qualquer origem
```

---

## 11. Decisões Técnicas em Aberto

| # | Questão | Opções | Impacto |
|---|---|---|---|
| 1 | Hosting da aplicação? | Vercel (PaaS) vs. VPS (Railway/DigitalOcean) | Custo e latência |
| 2 | Database hosting? | Supabase (managed) vs. VPS self-hosted | Backup automático vs. controle ops |
| 3 | O arquivo pending tem sempre sheet única? | Verificar com RPInfo se há variações | Parser assume sheet[0] |
| 4 | RPInfo gera arquivo de "liquidados" além do "pending"? | Verificar exports disponíveis | Pode substituir baixa manual |
| 5 | Notificações: e-mail ou WhatsApp? | Resend (e-mail) vs. Evolution API (WhatsApp) | Decide fornecedor para Fase 3 |
| 6 | Múltiplas unidades no mesmo arquivo? | Arquivo real tem unitCode = "001" | Se multi-loja, precisa filtro por unidade |
