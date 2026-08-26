-- School Store POS + Inventory — sales + sale_line_items tables.
-- Run this once in the Supabase SQL editor (same project as the rest of
-- school-store), after add_products.sql. Powers the Register checkout flow.
create table if not exists sales (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid references store_employees(id),   -- cashier who rang it up
  payment_method text not null check (payment_method in ('cash', 'card')),
  subtotal       numeric(10,2) not null check (subtotal >= 0),
  discount       numeric(10,2) not null default 0 check (discount >= 0),
  total          numeric(10,2) not null check (total >= 0),
  created_at     timestamptz not null default now()
);

create table if not exists sale_line_items (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references sales(id) on delete cascade,
  product_id    uuid references products(id),
  product_name  text not null,                          -- snapshot, so old receipts
  unit_price    numeric(10,2) not null check (unit_price >= 0),  -- stay accurate even if
  quantity      int not null check (quantity > 0),               -- the product later
  discount      numeric(10,2) not null default 0 check (discount >= 0), -- changes name/price
  line_total    numeric(10,2) not null check (line_total >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists sales_created_at_idx on sales (created_at);
create index if not exists sale_line_items_sale_id_idx on sale_line_items (sale_id);
