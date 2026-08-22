-- Adds a per-employee PIN for the kiosk's tap-then-PIN punch flow.
-- Run this once in the Supabase SQL editor (same project as the rest of
-- school-store). Existing employees start with pin = null, which the kiosk
-- treats as "not set up yet" and walks them through choosing one on their
-- next tap/QR scan.
alter table store_employees add column if not exists pin text;
