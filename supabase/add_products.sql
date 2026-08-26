-- School Store POS + Inventory -- products table.
-- Run this once in the Supabase SQL editor (same project as the rest of
-- school-store). Sales and sale_line_items come in a later migration once
-- checkout is built.
create table if not exists products (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    price               numeric(10,2) not null check (price >= 0),
    stock               int not null default 0 check (stock >= 0),
    low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
    photo_file          text,
    active              boolean not null default true,
    sale_active         boolean not null default false,
    sale_pct_off        int check (sale_pct_off between 1 and 100),
    sale_label          text,
    created_at          timestamptz not null default now()
  );

create index if not exists products_active_idx on products (active);
