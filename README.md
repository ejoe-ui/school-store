# RHS School Store — Punch Clock

A real-feeling NFC time clock for student store employees. Same stack pattern
as `hall-pass` and `checkmate`: Next.js + Supabase, deployed on Vercel.

## Pages

- `/` — Kiosk. Tap an NFC card (or tap a name tile) to clock in/out. Shows
  today's schedule on the side, full-screen confirmation on every tap.
- `/log` — Open activity log, no PIN required. Anyone can check their own punches.
- `/manager` — PIN-protected dashboard: Approvals, Totals & Points, Schedule,
  Swaps, Roster.
- `/summary` — Student-facing "My Hours" page. Tap your card, see hours +
  points for the month/quarter/all-time, printable/downloadable as a PDF via
  the browser's print dialog.

## Setup

### 1. Supabase

Run `supabase/schema.sql` in the SQL editor of the **same Supabase project**
already used by PassAble and CheckMate (this lets the punch clock reuse
PassAble's NFC-tagged students later if you ever want to auto-sync employees
the way CheckMate does — not required, roster is manual by default).

Change the default manager PIN after setup:

```sql
update store_settings set value = 'your-new-pin' where key = 'manager_pin';
```

### 2. Environment variables

Same two variables as hall-pass/checkmate, pointing at the same Supabase project:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 3. Deploy

Push this repo to GitHub, then import it into Vercel (same flow as the other
three apps). Set the env vars above in the Vercel project settings.

### 4. Hardware

Use the same USB NFC reader model already working with the PassAble roster
page and the CheckMate kiosk — it types the card's raw ID like a keyboard.
Plug it into whatever iPad/laptop/Chromebook sits at the school store
counter running `/` in fullscreen (kiosk/Guided Access mode recommended).

## NFC UID handling

`lib/nfc.js` normalizes scans the same way PassAble and CheckMate do:
raw hex-letter output is used as-is (uppercased); pure-decimal output is
converted to hex. Employee lookups try both the raw scan and the hex form,
so it doesn't matter whether a card outputs decimal or raw hex.

## Roster

Add employees manually in `/manager` → Roster: name + (optional) tap/scan
their card to assign it, or type the ID manually. A student doesn't need a
card assigned to be added — they'll just need a name-tile tap on the kiosk
until a card is assigned.
