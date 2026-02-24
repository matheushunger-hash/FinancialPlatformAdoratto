# PRD — Módulo de Contas a Receber (AR)
**FinancialPlatformAdoratto · v1.0 · Fevereiro 2026**

---

## 1. Visão Geral

### 1.1 Contexto e Problema

O Adoratto opera com um sistema de conciliação financeira nativo do RPInfo Flex que gera um **relatório diário de títulos de cartão pendentes de liquidação** (arquivo "pending"). Esse relatório contém cada transação de cartão processada no PDV com sua respectiva data prevista de recebimento, bandeira, adquirente, valor bruto, taxa administrativa e valor líquido.

O problema é que esse dado permanece preso em planilhas. Sem uma camada de gestão sobre ele, o time financeiro não consegue responder com confiança:
- Quanto vai entrar na conta amanhã?
- Qual é o custo efetivo das nossas bandeiras de voucher?
- Estamos recebendo exatamente o que o conciliador prometeu?

Sem essas respostas, qualquer construção de fluxo de caixa é uma estimativa de baixa confiança.

**Dados do arquivo analisado (amostra real — fev/2026):**
- 1.887 transações | Período: 18/jan a 21/fev/2026
- Valor bruto total: R$ 94.339,03
- Valor líquido a receber: R$ 90.480,38
- Custo total de taxas: R$ 3.858,65 (4,09% sobre bruto)
- Liquidação prevista: 23/02 a 27/02/2026 — 66% concentrado em 23/02
- 12 bandeiras: Visa, Mastercard, Elo, Amex + 8 vouchers/benefícios

### 1.2 Objetivo do Módulo

Construir um módulo de AR que transforma o arquivo diário do conciliador RPInfo em uma ferramenta de gestão financeira ativa — com visibilidade de recebimentos futuros, monitoramento de conciliação bancária, análise de custos por meio de pagamento e projeção de fluxo de caixa prospectivo.

### 1.3 Escopo

| Incluído neste PRD | Fora do escopo |
|---|---|
| Importação e processamento do arquivo pending | Emissão de cobranças para clientes finais |
| Calendário de recebimentos por data/bandeira | Gestão de inadimplência de pessoa física |
| Conciliação manual recebido × previsto | Integração direta com API do RPInfo Flex |
| Dashboard de recebimentos e KPIs | Módulo de Contas a Pagar (PRD separado) |
| Análise de custos por bandeira/adquirente | Nota fiscal / compliance fiscal (NF-e/NFC-e) |
| Projeção de fluxo de caixa baseada em AR | PIX Automático e Open Finance (fase futura) |

---

## 2. Usuários e Casos de Uso

### 2.1 Personas

| Persona | Perfil | Principal necessidade |
|---|---|---|
| Analista Financeiro | Operador diário. Faz upload, registra baixas, monitora divergências. | Visibilidade rápida e ações simples sem erros manuais |
| Gestor Financeiro | Toma decisões de caixa, negocia com adquirentes, aprova pagamentos. | Fluxo de caixa confiável e análise de custos por meio de pagamento |
| Direção / Sócio | Visão executiva. Consome relatórios. | KPIs consolidados, tendências e alertas de risco |

### 2.2 User Stories Prioritárias

**P1 — Crítico (MVP)**
- Como analista financeiro, quero fazer upload do arquivo pending do RPInfo e ver os recebimentos previstos organizados por data, para não precisar abrir planilha.
- Como analista financeiro, quero visualizar qual valor líquido vai entrar em cada dia dos próximos 7 dias, separado por bandeira e adquirente.
- Como analista financeiro, quero dar baixa manual em um recebimento informando o valor efetivamente depositado e a data, para criar histórico de conformidade.
- Como gestor financeiro, quero ver o total a receber no dashboard sem precisar abrir relatórios, com tendência em relação à semana anterior.

**P2 — Importante**
- Como analista financeiro, quero ser alertado quando um depósito esperado não foi registrado até o final do dia previsto.
- Como analista financeiro, quero comparar o valor previsto × o valor efetivamente recebido por data e adquirente.
- Como gestor financeiro, quero ver o custo efetivo de cada bandeira (% taxa + valor em R$).
- Como gestor financeiro, quero projetar o fluxo de caixa dos próximos 30 dias combinando recebíveis previstos com as despesas do módulo AP.

**P3 — Desejável (pós-MVP)**
- Como analista financeiro, quero importar o extrato bancário (OFX) e o sistema sugerir automaticamente qual recebível corresponde a cada crédito.
- Como gestor financeiro, quero ver a tendência de volume de vendas por bandeira ao longo dos últimos 3 meses.
- Como direção, quero receber um resumo semanal por e-mail/WhatsApp com os principais KPIs de AR.

---

## 3. Especificação Funcional

### 3.1 Importação do Arquivo Pending

**Regras de negócio:**
- O arquivo deve ter a linha de cabeçalho na linha 6 (índice 5), conforme estrutura identificada.
- Campos obrigatórios: Código, Bandeira, Modalidade, Data Transação, Data Pagamento, Valor Bruto, Valor Liquido, Taxa Adm., NSU.
- O sistema deve detectar e rejeitar linhas duplicadas com base no campo `Código`.
- Registros com Status diferente de "Venda" devem ser sinalizados para revisão manual.
- O sistema deve exibir um resumo de importação: total de linhas processadas, aceitas, rejeitadas, e valor líquido total do lote.
- Uploads do mesmo período (mesmo range de datas) devem alertar o usuário sobre possível duplicata antes de processar.

**Mapeamento de colunas — arquivo pending:**

| Coluna no arquivo | Campo interno | Tipo | Observação |
|---|---|---|---|
| Código | transaction_id | String (PK) | Identificador único da transação |
| Bandeira | brand | String | Ex: Visa, Mastercard, Ticket Alimentação |
| Modalidade | modality | String | Crédito / Vouchers Outros / Pré-pago Crédito |
| Autorizador | acquirer | String | Ex: Safrapay, VR, Ticket |
| Data Transação | transaction_date | Date | Data da venda no PDV |
| Data Pagamento | expected_payment_date | Date | Data prevista de depósito pelo adquirente |
| Valor Bruto | gross_amount | Decimal | Valor cobrado do cliente |
| Valor Liquido | net_amount | Decimal | Valor a ser depositado (após taxas) |
| Taxa Adm. | fee_amount | Decimal | Custo da taxa em R$ |
| Perc. Taxa Adm. | fee_pct | Decimal | Taxa percentual cobrada |
| NSU | nsu | String | Número sequencial único da transação |
| Parcela / Total Parcelas | installment / total_installments | Integer | Para transações parceladas (futuro) |
| Nome da Unidade | unit_name | String | Nome da loja / unidade |
| Cod. Flex. Unid. | unit_code | String | Código da unidade no RPInfo Flex |

### 3.2 Dashboard Principal

**Seção de KPIs (4 cards em linha horizontal):**

| Card | Valor exibido | Complemento |
|---|---|---|
| Total a Receber | Soma do net_amount de todos os recebíveis Pendentes | Variação vs. semana anterior (%) |
| Recebimentos Hoje | net_amount com expected_payment_date = hoje | Barra de progresso: confirmados / previstos |
| Próximos 7 dias | net_amount dos próximos 7 dias | Breakdown por dia em mini-gráfico de barras |
| Custo de Taxas (mês) | Soma de fee_amount no mês corrente | Taxa média efetiva (%) |

**Calendário de Recebimentos:** Linha do tempo 30 dias. Cada data mostra: valor líquido previsto, número de transações, e breakdown por adquirente (hover). Datas com depósito esperado mas não confirmado = sinalizadas em amarelo.

**Tabela de Recebíveis Pendentes:** Lista paginada e filtrável. Colunas: Data Pagamento | Bandeira | Adquirente | Qtd. Transações | Valor Bruto | Taxa | Valor Líquido | Status | Ações. Filtros: período (data de pagamento), bandeira, adquirente, status.

### 3.3 Gestão de Status dos Recebíveis

**Ciclo de vida:**

| Status | Descrição | Transição |
|---|---|---|
| PENDING | Importado do arquivo, depósito ainda não ocorreu | Automático na importação |
| CONFIRMED | Depósito registrado e valor bate com o previsto | Manual (baixa) ou automático (OFX futuro) |
| DIVERGENT | Depósito registrado mas valor difere do previsto | Manual — requer anotação de justificativa |
| OVERDUE | Data de pagamento passou e não há registro de depósito | Automático — regra D+1 |
| CANCELLED | Transação cancelada/estornada | Automático ou manual |

**Baixa manual de recebimento:** Ao clicar em "Registrar Recebimento", o operador informa:
- Data efetiva do depósito
- Valor efetivamente recebido (pode diferir do previsto)
- Forma de identificação (número do depósito, etc.)
- Observação livre (opcional)

O sistema calcula a divergência (`net_amount − received_amount`) e muda o status para CONFIRMED ou DIVERGENT.

### 3.4 Análise de Custos por Bandeira

**Insight identificado na análise da amostra real:**
> Vouchers (VR, Ticket, Sodexo, Alelo) cobram de 6,00% a 6,85% de taxa — mais que o dobro do Visa/Mastercard (2,83%). Além disso, têm janela de liquidação de 30 a 34 dias, vs. 2-3 dias do crédito convencional. Uma venda de R$100 no VR Benefícios gera R$6,85 de custo e o dinheiro só entra em ~31 dias.

**Visões disponíveis:**
- Tabela comparativa: % taxa média, custo total em R$, volume bruto, volume líquido, janela média de liquidação (dias)
- Gráfico de barras: custo em R$ por bandeira no período selecionado
- Evolução mensal do custo total de taxas
- Ranking de bandeiras por custo efetivo

### 3.5 Projeção de Fluxo de Caixa (AR)

**Lógica de projeção:**
- Cada recebível PENDING é uma entrada prevista no valor `net_amount` na data `expected_payment_date`.
- Recebíveis OVERDUE são exibidos como entradas em risco (vermelho).
- Recebíveis CONFIRMED são movidos para o realizado, saindo da projeção futura.
- O gráfico mostra duas linhas: previsto (pendentes) e realizado (confirmados), por dia ou semana.

---

## 4. Requisitos Não-Funcionais

| Categoria | Requisito | Meta |
|---|---|---|
| Performance | Processamento do arquivo pending (até 3.000 linhas) | < 5 segundos |
| Performance | Carregamento do dashboard principal | < 2 segundos |
| Confiabilidade | Detecção de duplicatas na importação | 100% — zero transação duplicada |
| Usabilidade | Upload do arquivo | Drag & drop + seleção de arquivo |
| Segurança | Acesso ao módulo | Autenticação com perfis: OPERATOR / MANAGER |
| Integridade | Edição de dados importados | Imutável — transações só mudam de status, nunca de valor |
| Auditoria | Log de ações | Toda baixa e importação registrada com usuário, data e hora |
| Responsividade | Interface | Funcional em desktop (1366px+) e mobile (360px+) |

---

## 5. Modelo de Dados (Simplificado)

### card_transactions
| Campo | Tipo | Descrição |
|---|---|---|
| id | BIGSERIAL PK | Identificador interno |
| transaction_id | VARCHAR UNIQUE | Código do arquivo RPInfo |
| import_batch_id | INTEGER FK | Referência ao lote de importação |
| transaction_date | DATE | Data da venda no PDV |
| expected_payment_date | DATE | Data prevista de depósito |
| brand | VARCHAR | Bandeira |
| acquirer | VARCHAR | Adquirente/autorizador |
| modality | VARCHAR | Modalidade |
| gross_amount | DECIMAL(12,2) | Valor bruto |
| net_amount | DECIMAL(12,2) | Valor líquido (a receber) |
| fee_amount | DECIMAL(12,2) | Taxa em R$ |
| fee_pct | DECIMAL(6,4) | Taxa percentual |
| nsu | VARCHAR | NSU da transação |
| unit_code | VARCHAR | Código da unidade no RPInfo |
| status | ENUM | pending/confirmed/divergent/overdue/cancelled |
| created_at | TIMESTAMP | Data de importação |

### import_batches
| Campo | Tipo | Descrição |
|---|---|---|
| id | BIGSERIAL PK | Identificador do lote |
| imported_by | INTEGER FK | Usuário que fez o upload |
| imported_at | TIMESTAMP | Data/hora do upload |
| filename | VARCHAR | Nome do arquivo original |
| total_rows | INTEGER | Total de linhas no arquivo |
| accepted_rows | INTEGER | Linhas aceitas |
| rejected_rows | INTEGER | Linhas rejeitadas |
| gross_total | DECIMAL(12,2) | Soma do valor bruto do lote |
| net_total | DECIMAL(12,2) | Soma do valor líquido do lote |
| date_from | DATE | Data de transação mais antiga |
| date_to | DATE | Data de transação mais recente |

### payment_receipts
| Campo | Tipo | Descrição |
|---|---|---|
| id | BIGSERIAL PK | Identificador da baixa |
| transaction_id | INTEGER FK | Referência à transação |
| received_at | DATE | Data efetiva do depósito |
| received_amount | DECIMAL(12,2) | Valor efetivamente recebido |
| divergence | DECIMAL(12,2) | Diferença: net_amount − received_amount |
| registered_by | INTEGER FK | Usuário que registrou a baixa |
| notes | TEXT | Observação livre |
| created_at | TIMESTAMP | Data/hora do registro |

### audit_log
| Campo | Tipo | Descrição |
|---|---|---|
| id | BIGSERIAL PK | |
| user_id | INTEGER FK | |
| action | VARCHAR | IMPORT_BATCH / CONFIRM_RECEIPT / MARK_DIVERGENT / AUTO_MARK_OVERDUE |
| entity_type | VARCHAR | CardTransaction / ImportBatch |
| entity_id | INTEGER | |
| before | JSONB | Estado anterior |
| after | JSONB | Estado posterior |
| created_at | TIMESTAMP | |

---

## 6. Roadmap de Implementação

| Fase | Entregas | Estimativa |
|---|---|---|
| **Fase 1 — Fundação (MVP)** | Parser do arquivo pending + validações; Banco de dados com as 4 tabelas; Tela de upload com resumo de importação; Listagem de recebíveis com filtros; Dashboard com 4 KPIs e calendário de 7 dias | 3–4 semanas |
| **Fase 2 — Operação** | Baixa manual de recebimentos; Detecção automática de OVERDUE; Análise de custos por bandeira; Projeção de fluxo de caixa AR (30 dias); Relatório exportável | 2–3 semanas |
| **Fase 3 — Integração AP** | Fusão com módulo AP para fluxo de caixa completo; Dashboard executivo unificado; Alertas por e-mail ou WhatsApp | 2–3 semanas |
| **Fase 4 — Automação** | Import automático via pasta monitorada; Conciliação semi-automática via OFX; Histórico e tendências de 12 meses | 4–5 semanas |

---

## 7. Critérios de Aceitação (Fase 1 — MVP)

1. Upload de um arquivo .xlsx real do RPInfo Flex é processado sem erros e todos os registros aparecem na listagem de recebíveis.
2. Nenhuma transação com Código duplicado é inserida no banco — tentativa de reupload do mesmo arquivo é bloqueada com mensagem clara.
3. Os valores exibidos no dashboard batem com a soma calculada manualmente a partir do arquivo original (tolerância: zero).
4. O calendário de recebimentos mostra corretamente o breakdown por data de pagamento, com valores líquidos corretos por dia.
5. É possível registrar uma baixa manual informando data, valor recebido e observação — o status muda para CONFIRMED ou DIVERGENT corretamente.
6. O log de auditoria registra corretamente o usuário, data e hora de cada importação e cada baixa realizada.
7. A interface funciona sem erros em Chrome, Firefox e Safari — desktop e mobile.

---

## 8. Glossário

| Termo | Definição |
|---|---|
| Arquivo Pending | Relatório diário gerado pelo conciliador RPInfo Flex listando transações de cartão/voucher pendentes de liquidação. |
| Adquirente | Empresa responsável por processar as transações de cartão e depositar o valor líquido (ex: Safrapay, VR, Ticket). |
| Bandeira | Rede do cartão ou voucher (ex: Visa, Mastercard, Ticket Alimentação, VR Benefícios). |
| Valor Bruto | Valor cobrado do cliente no momento da venda. |
| Valor Líquido | Valor efetivamente depositado pelo adquirente após dedução da taxa administrativa. |
| Taxa Administrativa | Percentual cobrado pelo adquirente. Varia de 2,83% (Visa/MC) a 6,85% (VR Benefícios). |
| Janela de Liquidação | Prazo entre a data da venda e a data do depósito. Crédito: ~2 dias. Vouchers: ~30–34 dias. |
| NSU | Número Sequencial Único — identificador da transação gerado pelo adquirente. |
| Baixa | Registro manual confirmando que um depósito previsto foi efetivamente recebido. |
| Divergência | Diferença entre o valor líquido previsto e o valor efetivamente depositado. |
| DSO | Days Sales Outstanding — em quantos dias, em média, os recebíveis são convertidos em caixa. |

---

## 9. Perguntas em Aberto

| # | Questão | Impacto | Status |
|---|---|---|---|
| 1 | O RPInfo Flex gera outros arquivos além do pending? (ex: liquidados, cancelados) | Alto — define se precisamos de múltiplos parsers | A definir |
| 2 | Existe mais de uma unidade/loja no escopo? | Médio — impacta filtros e permissões | A definir |
| 3 | Qual o banco e forma de acesso ao extrato bancário para conciliação futura? | Alto para Fase 4 | A definir |
| 4 | O módulo AP existente exporta dados em formato padronizado para integração? | Alto para Fase 3 | A definir |
| 5 | Há necessidade de suporte a transações parceladas? (arquivo atual só tem 1/1) | Médio — mudaria o modelo de dados | A avaliar |
| 6 | Qual o SLA esperado para alertas de recebimentos atrasados? | Baixo — afeta configuração de jobs | A definir |
