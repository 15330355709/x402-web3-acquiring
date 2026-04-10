-- Payment Links
create table payment_links (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null,
  amount numeric(20, 6) not null check (amount > 0),
  description text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'settlement_failed')),
  tx_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payment_links_merchant_id on payment_links(merchant_id);
create index idx_payment_links_status on payment_links(status);
create index idx_payment_links_expires_at on payment_links(expires_at) where status = 'pending';

-- Merchant Balances
create table merchant_balances (
  merchant_id text primary key,
  available_balance numeric(20, 6) not null default 0 check (available_balance >= 0),
  updated_at timestamptz not null default now()
);

-- Balance Ledger
create table balance_ledger (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchant_balances(merchant_id),
  type text not null check (type in ('credit', 'debit')),
  amount numeric(20, 6) not null check (amount > 0),
  reference_type text not null check (reference_type in ('payment', 'withdrawal')),
  reference_id uuid not null,
  tx_hash text,
  created_at timestamptz not null default now()
);

create index idx_balance_ledger_merchant_id on balance_ledger(merchant_id);
create index idx_balance_ledger_created_at on balance_ledger(created_at);

-- Withdrawals
create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchant_balances(merchant_id),
  amount numeric(20, 6) not null check (amount > 0),
  destination_address text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'completed', 'rejected', 'failed')),
  tx_hash text,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_withdrawals_merchant_id on withdrawals(merchant_id);
create index idx_withdrawals_status on withdrawals(status);
