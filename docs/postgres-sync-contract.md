# Contrato de Sincronização Futura com PostgreSQL

Este documento define o contrato técnico entre o armazenamento local SQLite do **Em Dia**, o formato de backup local (`BackupPayloadV1`) e a futura camada de sincronização com PostgreSQL multi-tenant.

## 1. Princípios Gerais

- **Offline-first**: toda operação de escrita continua sendo persistida primeiro no SQLite local, sem bloqueio de rede.
- **Valores monetários inteiros**: todos os valores monetários (`amount`, `limit_amount`, `paid_amount`, `current_balance`) são armazenados em **centavos** (`BIGINT` no PostgreSQL, `INTEGER` no SQLite), evitando imprecisão de ponto flutuante.
- **Multi-tenancy por `user_id` e Hardening de RLS**:
  - No PostgreSQL, todas as 10 tabelas de domínio e `sync_batches` recebem a coluna obrigatória `user_id UUID NOT NULL` (referenciando a tabela de usuários/contas autenticadas), compondo as chaves primárias (`PRIMARY KEY (user_id, id)` ou `PRIMARY KEY (user_id, key)` / `PRIMARY KEY (user_id, batch_id)`) e chaves estrangeiras compostas `(user_id, <fk>)` para impedir referências cruzadas entre tenants.
  - `user_id` é derivado **exclusivamente** do token JWT / contexto de sessão autenticado no servidor — valores de `user_id` eventualmente enviados no payload do cliente são ignorados ou rejeitados.
  - Todas as tabelas multi-tenant devem ter RLS ativado e forçado inclusive para o owner da tabela:
    - `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
    - `ALTER TABLE <table> FORCE ROW LEVEL SECURITY;`
    - Políticas `USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id())` (ex.: `auth.uid()` ou variável de sessão definida por transação).
- **Soft delete obrigatório**: exclusões nunca removem fisicamente os registros antes da sincronização; preenchem `deleted_at` em UTC.

## 2. Geração e Imutabilidade de UUIDs

- As 9 tabelas com chave primária `id` utilizam identificadores gerados localmente pela função `generateUuid()` (`UUID v4`), em formato canônico lowercase (`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`).
- No PostgreSQL, `id` é armazenado como `UUID` (não gerado pelo servidor durante o sync, preservando o `id` criado offline).
- **Imutabilidade**: após a criação do registro, `id` (ou `key` em `app_settings`) nunca é alterado. Chaves estrangeiras (`category_id`, `owner_id`, `invoice_id`, `transaction_id`, `investment_id`) sempre apontam para o `UUID` original.

## 3. Semântica de `created_at`, `updated_at` e `deleted_at`

- Todas as timestamps são armazenadas como strings ISO-8601 UTC no SQLite (`YYYY-MM-DDTHH:mm:ss.sssZ`, via `nowIsoUtc()`) e mapeadas para `TIMESTAMPTZ NOT NULL` (`created_at`, `updated_at`) e `TIMESTAMPTZ NULL` (`deleted_at`) no PostgreSQL.
- `created_at`: definido na criação e imutável.
- `updated_at`: atualizado em toda mutação, incluindo soft delete (`deleted_at` preenchido).
- `deleted_at`: `NULL` quando ativo; timestamp UTC quando excluído logicamente (tombstone).
- **Retenção de tombstones**:
  - Tombstones são preservados integralmente nos backups locais (`BackupPayloadV1`) para evitar ressurreição de registros excluídos em restaurações ou futuros syncs.
  - No servidor PostgreSQL, tombstones devem ser mantidos por janela mínima de retenção (ex.: 90 dias após o último sync bem-sucedido de dispositivos ativos) antes de eventual compactação/purge. Se um dispositivo retornar após o purge de tombstones antigos, deve executar um *full resync* a partir de snapshot completo.

## 4. Mapeamento das 10 Tabelas (SQLite → PostgreSQL)

### 4.1 `categories`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `name` | `TEXT` | `NOT NULL` |
| `color` | `TEXT` | `NULL` |
| `icon` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

### 4.2 `owners`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `name` | `TEXT` | `NOT NULL` |
| `is_self` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` (SQLite `0 \| 1`) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

- **Índice parcial**: `CREATE UNIQUE INDEX idx_owners_unique_self_active ON owners (user_id) WHERE is_self = TRUE AND deleted_at IS NULL;`

### 4.3 `invoices`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `name` | `TEXT` | `NOT NULL` |
| `limit_amount` | `BIGINT` | `NOT NULL DEFAULT 0 CHECK (limit_amount >= 0)` |
| `color` | `TEXT` | `NULL` |
| `due_day` | `SMALLINT` | `NOT NULL CHECK (due_day BETWEEN 1 AND 31)` |
| `closing_day` | `SMALLINT` | `NULL CHECK (closing_day IS NULL OR closing_day BETWEEN 1 AND 31)` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

### 4.4 `goals`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `since` | `TEXT` | `NOT NULL` (formato `YYYY-MM`) |
| `amount` | `BIGINT` | `NOT NULL CHECK (amount >= 0)` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

- **Índices**:
  - `CREATE INDEX idx_goals_user_since ON goals (user_id, since DESC);`
  - `CREATE UNIQUE INDEX idx_goals_unique_since_active ON goals (user_id, since) WHERE deleted_at IS NULL;`

### 4.5 `investments`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `name` | `TEXT` | `NOT NULL` |
| `type` | `TEXT` | `NULL` |
| `institution` | `TEXT` | `NULL` |
| `current_balance` | `BIGINT` | `NOT NULL DEFAULT 0 CHECK (current_balance >= 0)` |
| `notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

### 4.6 `app_settings`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `key` | `TEXT` | `PRIMARY KEY (user_id, key)` no PostgreSQL |
| — | `UUID` | `user_id NOT NULL` |
| `value` | `TEXT` | `NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

### 4.7 `category_budgets`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `category_id` | `UUID` | `NOT NULL` (`FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE CASCADE`) |
| `month` | `TEXT` | `NOT NULL` (formato `YYYY-MM`) |
| `amount` | `BIGINT` | `NOT NULL CHECK (amount >= 0)` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

- **Índices**:
  - `CREATE INDEX idx_category_budgets_category_month ON category_budgets (user_id, category_id, month DESC);`
  - `CREATE UNIQUE INDEX idx_category_budgets_unique_active ON category_budgets (user_id, category_id, month) WHERE deleted_at IS NULL;`

### 4.8 `transactions`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `name` | `TEXT` | `NOT NULL` |
| `type` | `TEXT` | `NOT NULL CHECK (type IN ('INCOME', 'EXPENSE'))` |
| `amount` | `BIGINT` | `NOT NULL CHECK (amount > 0)` |
| `category_id` | `UUID` | `NULL` (`FOREIGN KEY (user_id, category_id) REFERENCES categories(user_id, id) ON DELETE SET NULL (category_id)` no PG 15+, preservando `user_id`) |
| `owner_id` | `UUID` | `NOT NULL` (`FOREIGN KEY (user_id, owner_id) REFERENCES owners(user_id, id) ON DELETE RESTRICT`) |
| `invoice_id` | `UUID` | `NULL` (`FOREIGN KEY (user_id, invoice_id) REFERENCES invoices(user_id, id) ON DELETE SET NULL (invoice_id)` no PG 15+, preservando `user_id`) |
| `group_id` | `UUID` | `NULL` |
| `installments_count` | `INTEGER` | `NOT NULL DEFAULT 1 CHECK (installments_count >= 1)` |
| `recurrence` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` (SQLite `0 \| 1`) |
| `active` | `BOOLEAN` | `NOT NULL DEFAULT TRUE` (SQLite `0 \| 1`) |
| `notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

- **Índices**:
  - `idx_transactions_owner_id (user_id, owner_id)`
  - `idx_transactions_category_id (user_id, category_id)`
  - `idx_transactions_invoice_id (user_id, invoice_id)`
  - `idx_transactions_group_id (user_id, group_id)`
  - `CREATE INDEX idx_transactions_recurring_active ON transactions (user_id, recurrence, active) WHERE recurrence = TRUE AND active = TRUE AND deleted_at IS NULL;`

### 4.9 `installments`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `transaction_id` | `UUID` | `NOT NULL` (`FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(user_id, id) ON DELETE CASCADE`) |
| `number` | `INTEGER` | `NOT NULL CHECK (number >= 1)` |
| `amount` | `BIGINT` | `NOT NULL CHECK (amount >= 0)` |
| `paid_amount` | `BIGINT` | `NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount)` |
| `due_date` | `TEXT` | `NOT NULL` (formato `YYYY-MM-DD`) |
| `paid_at` | `TIMESTAMPTZ` | `NULL` |
| `status` | `TEXT` | `NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID'))` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

- **Índices**:
  - `CREATE UNIQUE INDEX idx_installments_transaction_number ON installments (user_id, transaction_id, number) WHERE deleted_at IS NULL;`
  - `CREATE INDEX idx_installments_due_date_pending ON installments (user_id, due_date) WHERE status = 'PENDING' AND deleted_at IS NULL;`

### 4.10 `investment_contributions`

| Coluna SQLite | Tipo PostgreSQL | Constraints / Observações |
|---|---|---|
| `id` | `UUID` | `PRIMARY KEY (user_id, id)` |
| — | `UUID` | `user_id NOT NULL` |
| `investment_id` | `UUID` | `NOT NULL` (`FOREIGN KEY (user_id, investment_id) REFERENCES investments(user_id, id) ON DELETE CASCADE`) |
| `amount` | `BIGINT` | `NOT NULL CHECK (amount > 0)` |
| `contributed_at` | `TEXT` | `NOT NULL` (formato `YYYY-MM-DD` ou timestamp ISO-8601 UTC `YYYY-MM-DDTHH:mm:ss.sssZ`) |
| `notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `deleted_at` | `TIMESTAMPTZ` | `NULL` |

- **Índice**:
  - `CREATE INDEX idx_investment_contributions_investment_date ON investment_contributions (user_id, investment_id, contributed_at DESC);`

### 4.11 Índices de Sincronização Recomendados no PostgreSQL

Para suportar `pull` incremental eficiente por cursor em todas as 10 tabelas:

- `CREATE INDEX idx_<table>_sync_cursor ON <table> (user_id, server_seq);` (onde `server_seq BIGSERIAL` é atribuído monotonicamente pelo servidor a cada inserção/atualização/tombstone).

## 5. Protocolo Incremental (`pull` + `push`)

### 5.1 `pull` por Cursor

1. O cliente envia `GET /sync/pull?cursor=<last_server_seq>&limit=<page_size>`.
2. O servidor retorna registros com `server_seq > cursor` pertencentes ao `user_id` autenticado, ordenados por `server_seq ASC`, incluindo registros com `deleted_at IS NOT NULL`.
3. O payload retornado agrupa os registros em ordem topológica (tabelas pai antes de filhas: `categories`, `owners`, `invoices`, `goals`, `investments`, `app_settings`, `category_budgets`, `transactions`, `installments`, `investment_contributions`) e informa `nextCursor` e `hasMore`.
4. O cliente aplica o lote em transação única SQLite e persiste `nextCursor` localmente apenas após commit bem-sucedido.

### 5.2 `push` Idempotente

1. O cliente envia `POST /sync/push` com `batchId` (UUID gerado para a tentativa) e lista de mutações ordenadas topologicamente.
2. Cada mutação carrega o registro completo no estado local atual, incluindo `updated_at` e `deleted_at`.
3. O servidor processa o lote em transação única:
   - Registra `(user_id, batch_id)` na tabela de idempotência `sync_batches` (`PRIMARY KEY (user_id, batch_id)`, com `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`) para evitar reaplicação em caso de *retry* por falha de rede e isolar lotes entre tenants.
   - Aplica regras de resolução de conflitos antes de persistir e atualizar `server_seq`.
   - Retorna o status por item (`applied`, `conflict_resolved`, `rejected`) e o `server_seq` atualizado.

## 6. Estratégia de Resolução de Conflitos

### 6.1 Regra Base: Last-Write-Wins (LWW) por `updated_at` UTC

- Compara-se `incoming.updated_at` contra `current.updated_at` em UTC.
- **Limite de clock skew**: o servidor deve validar que `incoming.updated_at <= NOW() + INTERVAL '5 minutes'` (tolerância máxima de *clock skew* futuro). Registros com `updated_at` acima desse limite devem ser rejeitados (`rejected`) ou normalizados para o timestamp do servidor antes do LWW, impedindo que um relógio adiantado bloqueie atualizações futuras legítimas.
- Se `incoming.updated_at > current.updated_at`, o registro recebido vence.
- Em caso de empate exato (`incoming.updated_at === current.updated_at`), mantém-se o estado já persistido no servidor (ou desempate determinístico por `device_id` se adotado).

### 6.2 Conflito `update` vs `deleted_at`

- A resolução segue LWW por `updated_at`:
  - Se um dispositivo excluiu o registro (`deleted_at !== null`) com `updated_at` mais recente que uma edição concorrente, o tombstone prevalece.
  - Caso contrário, se uma edição posterior reativou ou alterou o registro com `updated_at` maior e `deleted_at === null`, a edição prevalece.
- Exclusões de entidades pai (`categories`, `invoices`, `owners`, `transactions`, `investments`) propagam efeitos consistentes em cascata ou `SET NULL` conforme FKs, atualizando `updated_at` dos filhos afetados para propagar aos demais clientes.

### 6.3 Regras Específicas de Unicidade Parcial

1. **`owners.is_self`**:
   - Apenas um registro ativo (`deleted_at IS NULL`) por `user_id` pode ter `is_self = TRUE`.
   - Se dois dispositivos criarem um `selfOwner` diferente offline, o vencedor (preferencialmente o já existente no servidor, ou o de `created_at` mais antigo / `updated_at` mais recente) permanece `is_self = TRUE`, e o outro é rebaixado para `is_self = FALSE` ou mesclado via remapeamento de `owner_id` nas `transactions`.
2. **`installments (transaction_id, number)`**:
   - Restrição `UNIQUE` ativa (`deleted_at IS NULL`) impede duas parcelas ativas com o mesmo número na mesma transação.
   - Se duas parcelas com UUIDs distintos colidirem em `(transaction_id, number)` devido à geração independente de recorrência (`ensureRecurringInstallments`) em dois dispositivos offline, o servidor aplica LWW ou preserva a parcela paga (`status = 'PAID'`) / mais antiga, marcando a duplicata com `deleted_at` e atualizando `updated_at` para propagar a reconciliação no próximo `pull`.
3. **`category_budgets (category_id, month)`**:
   - Restrição `UNIQUE` ativa (`deleted_at IS NULL`). Em colisão de UUIDs distintos para o mesmo `(category_id, month)`, vence o registro com `updated_at` mais recente; o perdedor recebe `deleted_at` e `updated_at` atualizados.
4. **`goals (since)`**:
   - Restrição `UNIQUE` ativa (`deleted_at IS NULL`). Em colisão de UUIDs distintos para o mesmo `since`, vence o registro com `updated_at` mais recente; o perdedor recebe `deleted_at` e `updated_at` atualizados.

## 7. Ponte entre `BackupPayloadV1` e o Sync Futuro

- O formato `BackupPayloadV1` (`format: "emdia-backup"`, `backupVersion: 1`) exporta exatamente os mesmos campos estruturais das 10 tabelas descritas na seção 4, incluindo tombstones (`deleted_at`).
- **Importação como seed de dispositivo novo**: ao restaurar um `BackupPayloadV1` em um dispositivo que venha a conectar-se ao PostgreSQL posteriormente, todos os UUIDs, `created_at`, `updated_at` e `deleted_at` preservados permitem reconciliar o estado com o servidor sem perder histórico nem ressuscitar registros excluídos.
- **Migração de conta local para conta autenticada**:
  1. Ao vincular um banco local (ou restaurado via `BackupPayloadV1`) a uma conta PostgreSQL pela primeira vez, o cliente envia um *initial push* com os registros locais associando-os ao `user_id` autenticado.
  2. Se a conta no servidor já possuir dados, executa-se primeiro um `pull` completo ou reconciliação LWW + regras de unicidade parcial (seção 6.3), evitando sobrescrever silenciosamente dados mais recentes na nuvem.
  3. Após a restauração de um backup local em dispositivo já sincronizado, o cursor local de sync (`last_server_seq`) deve ser resetado para forçar reconciliação segura com o servidor no próximo ciclo.
