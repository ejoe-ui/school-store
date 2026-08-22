import { supabase } from './supabase'

// USB NFC readers behave like a keyboard: they type the card's raw ID
// followed by Enter. Some cards output pure decimal; others output raw hex
// containing letters a-f. If we see a hex letter, the value IS the UID â
// use it as-is (uppercased). Otherwise treat it as decimal and convert.
// This mirrors the fix applied to hall-pass/app/kiosk/page.jsx,
// hall-pass/app/wire/page.jsx, and checkmate/src/lib/nfc.js â written in
// from day one here so this app never has the truncation/case bugs those
// three had to be fixed for.
export function decimalToHexUid(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  if (/[a-fA-F]/.test(trimmed)) {
    return trimmed.toUpperCase().padStart(8, '0')
  }
  const num = parseInt(trimmed, 10)
  if (isNaN(num) || num < 0) return null
  return num.toString(16).toUpperCase().padStart(8, '0')
}

// Resolves a raw scan to an employee record. Tries both the raw value and
// its hex-converted form, since nfc_uid may have been synced verbatim from
// PassAble (always hex) or entered directly here (could be raw reader output).
export async function resolveEmployed(rawUid) {
  const raw = String(rawUid || '').trim()
  if (!raw) return null
  const hex = decimalToHexUid(raw)
  const candidates = hex && hex !== raw ? [raw, hex] : [raw]

  const { data } = await supabase
    .from('store_employees')
    .select('*')
    .in('nfc_uid', candidates)
    .eq('active', true)
    .maybeSingle()

  return data || null
}

// Resolves an employee by their store_employees.id (the primary key).
// Used for QR-badge punches â the printed/displayed QR just encodes this id,
// so no separate token column is needed alongside nfc_uid.
export async function resolveEmployeeById(id) {
  const trimmed = String(id || '').trim()
  if (!trimmed) return null
  const { data } = await supabase
    .from('store_employees')
    .select('*')
    .eq('id', trimmed)
    .eq('active', true)
    .maybeSingle()

  return data || null
}
