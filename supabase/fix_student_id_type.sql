-- Fixes the "invalid input syntax for type uuid" error when linking an
-- employee to a student in the manager Roster tab.
--
-- store_employees.student_id was created as a `uuid` column, but real
-- student IDs (pulled from PassAble/Aeries, e.g. "437002") are plain text —
-- they were never UUIDs. Every real link attempt has been failing.
--
-- Run this once in the Supabase SQL editor (same project as the rest of
-- school-store). Safe to run even if student_id is currently empty/null
-- for every row.

alter table store_employees
  alter column student_id type text using student_id::text;
