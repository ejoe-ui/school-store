-- Per-employee manager access: replaces the single shared manager PIN
-- with a real role flag on each employee row.

alter table store_employees
  add column if not exists is_manager boolean not null default false;

-- Grandfather in everyone currently active so nobody gets locked out
-- of /manager the moment this ships. Managers can then use the Roster
-- tab to grant/revoke access for individual people going forward.
update store_employees set is_manager = true where active = true;
