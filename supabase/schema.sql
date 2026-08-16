-- ═══════════════════════════════════════════════════════════════════════════
-- RHS School Store — Punch Clock
-- Run this in the Supabase SQL editor (same project as PassAble/CheckMate).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Employees ─────────────────────────────────────────────────────────────
-- One row per student employee. passable_id links back to PassAble's
-- students.id (Aeries student ID) so we can pull name/photo from there if
-- needed. nfc_uid is copied from PassAble the same way CheckMate does it —
-- always store uppercase hex, never overwrite an existing value on re-sync.
create table if not exists store_employees (
  id            uuid primary key default gen_random_uuid(),
  passable_id   text unique,              -- PassAble students.id, null if manually added
  nfc_uid       text unique,              -- uppercase hex, matches PassAble/CheckMate format
  name          text not null,
  email         text,
  photo_file    text,                     -- lifetouch-raw filename, mirrors PassAble/CheckMate
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists store_employees_nfc_uid_idx on store_employees (nfc_uid);

-- ── Shifts (clock in / clock out events) ─────────────────────────────────
create table if not exists store_shifts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references store_employees(id) on delete cascade,
  clock_in_at     timestamptz not null,
  clock_out_at    timestamptz,
  status          text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by     text,
  approved_at     timestamptz,
  corrected       boolean not null default false,   -- true if a manager edited the times
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists store_shifts_employee_idx on store_shifts (employee_id, clock_in_at desc);
create index if not exists store_shifts_status_idx on store_shifts (status);

-- ── Recurring weekly schedule ─────────────────────────────────────────────
create table if not exists store_schedule (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references store_employees(id) on delete cascade,
  day_of_week   int not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time    text not null,   -- 'HH:MM' 24h
  end_time      text not null
);

create index if not exists store_schedule_day_idx on store_schedule (day_of_week);

-- ── One-off swaps (covers a specific date without touching the template) ─
create table if not exists store_swaps (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  original_employee_id  uuid references store_employees(id) on delete set null,
  covering_employee_id  uuid not null references store_employees(id) on delete cascade,
  start_time            text not null,
  end_time              text not null,
  note                  text
);

create index if not exists store_swaps_date_idx on store_swaps (date);

-- ── Settings (manager PIN, points-per-hour rate) ──────────────────────────
create table if not exists store_settings (
  key    text primary key,
  value  text
);

insert into store_settings (key, value) values
  ('manager_pin', '1234'),
  ('points_per_hour', '1')
on conflict (key) do nothing;
