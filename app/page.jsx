'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { resolveEmployee, resolveEmployeeById } from '../lib/nfc'
import { fmtDuration, fmtTime, fmtDateLong, minutesBetween, DAY_NAMES } from '../lib/time'
import NfcListener from '../components/NfcListener'
import PinPad from '../components/PinPad'
import QrScanner from '../components/QrScanner'

const GREEN = '#006938'
const DARK  = '#0b1f16'

function initials(name) {
  return (name || '')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Kiosk() {
  const [now, setNow] = useState(null)
  const [employees, setEmployees] = useState([])
  const [openShifts, setOpenShifts] = useState({})   // employee_id -> shift row
  const [scheduleRows, setScheduleRows] = useState([]) // today's display rows
  const [flash, setFlash] = useState(null)             // { kind: 'welcome'|'bye'|'error', text, sub, photoUrl }
  const [loading, setLoading] = useState(true)
  const flashTimer = useRef(null)

  // ── PIN gate + QR scan state ──────────────────────────────────────────
  // A tap (tile, NFC, or QR) never punches directly anymore — it opens the
  // PIN pad first. This closes both the "hand a friend your badge" gap and
  // the "just tap someone else's tile on screen" gap, since every punch now
  // needs something the employee has (badge/QR) AND something only they
  // know (PIN).
  const [pendingEmployee, setPendingEmployee] = useState(null)
  const [pinMode, setPinMode] = useState(null)   // 'verify' | 'set-first' | 'set-confirm'
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [firstPin, setFirstPin] = useState('')
  const [showQr, setShowQr] = useState(false)

  // ── Clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Load employees + open shifts + today's schedule ─────────────────────
  // students.id is not unique on its own (composite PK with period), so we
  // can't rely on a PostgREST embedded FK relationship — fetch and merge
  // manually instead.
  const attachStudents = useCallback(async (emps) => {
    const ids = [...new Set((emps || []).map(e => e.student_id).filter(Boolean))]
    if (!ids.length) return (emps || []).map(e => ({ ...e, students: null }))
    const { data: studs } = await supabase
      .from('students')
      .select('id, full_name, photo_file')
      .in('id', ids)
    const byId = {}
    ;(studs || []).forEach(s => { if (!byId[s.id]) byId[s.id] = s })
    return (emps || []).map(e => ({ ...e, students: e.student_id ? byId[e.student_id] || null : null }))
  }, [])

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('store_employees')
      .select('*')
      .eq('active', true).order('name')
    setEmployees(await attachStudents(data))
  }, [attachStudents])

  const loadOpenShifts = useCallback(async () => {
    const { data } = await supabase
      .from('store_shifts').select('*').is('clock_out_at', null)
    const map = {}
    ;(data || []).forEach(s => { map[s.employee_id] = s })
    setOpenShifts(map)
  }, [])

  const loadTodaySchedule = useCallback(async (employeeList) => {
    const today = new Date()
    const dow = today.getDay()
    const dateStr = today.toISOString().slice(0, 10)
    const byId = Object.fromEntries((employeeList || []).map(e => [e.id, e]))

    const [{ data: sched }, { data: swaps }] = await Promise.all([
      supabase.from('store_schedule').select('*').eq('day_of_week', dow),
      supabase.from('store_swaps').select('*').eq('date', dateStr),
    ])

    const swapByOriginal = new Map((swaps || []).filter(s => s.original_employee_id).map(s => [s.original_employee_id, s]))
    const extraSwaps = (swaps || []).filter(s => !s.original_employee_id)

    const rows = (sched || []).map(row => {
      const swap = swapByOriginal.get(row.employee_id)
      if (swap) {
        return {
          key: row.id,
          name: byId[swap.covering_employee_id]?.name || 'Unknown',
          time: `${swap.start_time}–${swap.end_time}`,
          covering: byId[row.employee_id]?.name || null,
        }
      }
      return {
        key: row.id,
        name: byId[row.employee_id]?.name || 'Unknown',
        time: `${row.start_time}–${row.end_time}`,
        covering: null,
      }
    })

    extraSwaps.forEach(s => rows.push({
      key: s.id,
      name: byId[s.covering_employee_id]?.name || 'Unknown',
      time: `${s.start_time}–${s.end_time}`,
      covering: null,
    }))

    rows.sort((a, b) => a.time.localeCompare(b.time))
    setScheduleRows(rows)
  }, [])

  const loadAll = useCallback(async () => {
    const { data: emps } = await supabase
      .from('store_employees')
      .select('*')
      .eq('active', true).order('name')
    const merged = await attachStudents(emps)
    setEmployees(merged)
    await Promise.all([loadOpenShifts(), loadTodaySchedule(merged)])
    setLoading(false)
  }, [loadOpenShifts, loadTodaySchedule, attachStudents])

  useEffect(() => { loadAll() }, [loadAll])

  // If a scan resolves an employee without the student-photo join (NFC/QR
  // lookups query store_employees alone), prefer the already-merged copy
  // from `employees` so the confirmation screen can still show their photo.
  const enrich = useCallback((employee) => {
    if (!employee) return employee
    return employees.find(e => e.id === employee.id) || employee
  }, [employees])

  // ── Flash helper ──────────────────────────────────────────────────
  const showFlash = useCallback((flashObj, duration = 3000) => {
    clearTimeout(flashTimer.current)
    setFlash(flashObj)
    flashTimer.current = setTimeout(() => setFlash(null), duration)
  }, [])

  // ── Punch logic (only ever called after a PIN has been verified) ────────
  const punch = useCallback(async (employee) => {
    const openShift = openShifts[employee.id]

    let photoUrl = null
    const linkedPhoto = employee.students?.photo_file
    if (linkedPhoto) {
      const { data } = await supabase.storage.from('student-photos').createSignedUrl(linkedPhoto, 300)
      if (data?.signedUrl) photoUrl = data.signedUrl
    }

    if (openShift) {
      // ── Clock out ──────────────────────────────────────────────────────
      const clockOutAt = new Date().toISOString()
      const mins = minutesBetween(openShift.clock_in_at, clockOutAt)
      await supabase.from('store_shifts')
        .update({ clock_out_at: clockOutAt })
        .eq('id', openShift.id)
      showFlash({
        kind: 'bye',
        text: `See you, ${employee.name.split(' ')[0]}!`,
        sub: `Worked ${fmtDuration(mins)} — pending manager approval`,
        photoUrl,
      })
    } else {
      // ── Clock in ───────────────────────────────────────────────────────
      await supabase.from('store_shifts').insert({
        employee_id: employee.id,
        clock_in_at: new Date().toISOString(),
      })
      showFlash({
        kind: 'welcome',
        text: `Welcome, ${employee.name.split(' ')[0]}!`,
        sub: 'Clocked in',
        photoUrl,
      })
    }

    loadOpenShifts()
  }, [openShifts, showFlash, loadOpenShifts])

  // ── PIN gate ────────────────────────────────────────────────────────────
  const closePunch = useCallback(() => {
    setPendingEmployee(null)
    setPinMode(null)
    setPinError('')
    setPinBusy(false)
    setAttempts(0)
    setFirstPin('')
  }, [])

  const beginPunch = useCallback((employee) => {
    if (!employee) return
    setPinError('')
    setAttempts(0)
    setFirstPin('')
    setPendingEmployee(employee)
    setPinMode(employee.pin ? 'verify' : 'set-first')
  }, [])

  const handlePinComplete = useCallback(async (digits) => {
    if (!pendingEmployee) return

    if (pinMode === 'verify') {
      if (digits === pendingEmployee.pin) {
        setPinBusy(true)
        await punch(pendingEmployee)
        closePunch()
        return
      }
      const next = attempts + 1
      if (next >= 3) {
        showFlash({ kind: 'error', text: 'Too many tries', sub: 'Ask a manager for help with your PIN' }, 3500)
        closePunch()
        return
      }
      setAttempts(next)
      setPinError('Wrong PIN — try again')
      return
    }

    if (pinMode === 'set-first') {
      setFirstPin(digits)
      setPinError('')
      setPinMode('set-confirm')
      return
    }

    if (pinMode === 'set-confirm') {
      if (digits !== firstPin) {
        setPinError('Didn’t match — start over')
        setFirstPin('')
        setPinMode('set-first')
        return
      }
      setPinBusy(true)
      await supabase.from('store_employees').update({ pin: digits }).eq('id', pendingEmployee.id)
      await punch({ ...pendingEmployee, pin: digits })
      loadEmployees()
      closePunch()
    }
  }, [pendingEmployee, pinMode, attempts, firstPin, punch, showFlash, closePunch, loadEmployees])

  // ── NFC scan handler ──────────────────────────────────────────────────
  const handleScan = useCallback(async (rawUid) => {
    const employee = await resolveEmployee(rawUid)
    if (!employee) {
      showFlash({ kind: 'error', text: 'Card not recognized', sub: 'Not registered in the punch clock roster' }, 3500)
      return
    }
    beginPunch(enrich(employee))
  }, [beginPunch, enrich, showFlash])

  // ── QR scan handler ─────────────────────────────────────────────────────
  const handleQrScan = useCallback(async (code) => {
    setShowQr(false)
    const employee = await resolveEmployeeById(code)
    if (!employee) {
      showFlash({ kind: 'error', text: 'QR not recognized', sub: 'Not registered in the punch clock roster' }, 3500)
      return
    }
    beginPunch(enrich(employee))
  }, [beginPunch, enrich, showFlash])

  const pinTitle = pinMode === 'verify'
    ? `Enter your PIN — ${pendingEmployee?.name?.split(' ')[0] || ''}`
    : pinMode === 'set-confirm'
      ? 'Confirm your new PIN'
      : `Choose a PIN — ${pendingEmployee?.name?.split(' ')[0] || ''}`

  const pinSubtitle = pinMode === 'verify'
    ? 'Ask a manager to reset it if you forgot.'
    : pinMode === 'set-confirm'
      ? 'Enter the same 4 digits again to confirm.'
      : 'Pick 4 digits nobody else knows. You’ll use it every time you clock in or out.'

  return (
    <div style={{
      minHeight: '100vh', background: DARK, color: 'white',
      display: 'flex', flexDirection: 'column', padding: 24, boxSizing: 'border-box',
    }}>
      <NfcListener onScan={handleScan} disabled={!!flash || !!pendingEmployee || showQr} />

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.15em', color: '#8fae9c', textTransform: 'uppercase' }}>
            RHS School Store
          </div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Punch Clock</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 44, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1 }}>
            {now ? now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
          </div>
          <div style={{ fontSize: 13, color: '#8fae9c', marginTop: 4 }}>{now ? fmtDateLong(now) : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
        {/* ── Tap tiles ── */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 13, color: '#8fae9c', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Tap your card, or tap your name — you'll enter your PIN next
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 14, overflowY: 'auto', paddingRight: 4,
          }}>
            {loading && <div style={{ color: '#8fae9c' }}>Loading…</div>}
            {!loading && employees.length === 0 && (
              <div style={{ color: '#8fae9c' }}>No employees yet — add some in the manager dashboard.</div>
            )}
            {employees.map(emp => {
              const shift = openShifts[emp.id]
              return (
                <button
                  key={emp.id}
                  onClick={() => beginPunch(emp)}
                  style={{
                    background: shift ? '#0e3524' : '#122a1f',
                    border: `1px solid ${shift ? GREEN : '#1e3a2c'}`,
                    borderRadius: 14, padding: '16px 12px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    color: 'white', textAlign: 'center',
                  }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%', background: shift ? GREEN : '#274a37',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 15,
                  }}>
                    {initials(emp.name)}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: shift ? '#7CFFB2' : '#8fae9c',
                  }}>
                    {shift ? `IN · since ${fmtTime(shift.clock_in_at)}` : 'OUT'}
                  </div>
                </button>
              )
            })}
          </div>
          <button onClick={() => setShowQr(true)} style={{
            marginTop: 14, alignSelf: 'flex-start', padding: '10px 16px', borderRadius: 10,
            border: '1px solid #274a37', background: '#122a1f', color: '#8fae9c',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            📷 Don't have your card? Scan your QR badge
          </button>
        </div>

        {/* ── Today's schedule ── */}
        <div style={{
          flex: 1, background: '#0e1f17', borderRadius: 16, border: '1px solid #1e3a2c',
          padding: 18, display: 'flex', flexDirection: 'column', minWidth: 220,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            {now ? DAY_NAMES[now.getDay()] : ''}'s Schedule
          </div>
          {scheduleRows.length === 0 && (
            <div style={{ color: '#8fae9c', fontSize: 13 }}>No shifts scheduled today.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
            {scheduleRows.map(row => (
              <div key={row.key} style={{ borderBottom: '1px solid #1e3a2c', paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{row.name}</div>
                <div style={{ fontSize: 12, color: '#8fae9c' }}>
                  {row.time}{row.covering ? ` · covering ${row.covering}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PIN pad overlay ── */}
      {pendingEmployee && pinMode && (
        <PinPad
          key={pinMode + attempts}
          title={pinTitle}
          subtitle={pinSubtitle}
          error={pinError}
          busy={pinBusy}
          onCancel={closePunch}
          onComplete={handlePinComplete}
        />
      )}

      {/* ── QR scanner overlay ── */}
      {showQr && (
        <QrScanner onScan={handleQrScan} onCancel={() => setShowQr(false)} />
      )}

      {/* ── Full-screen confirmation flash ── */}
      {flash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: flash.kind === 'error' ? 'linear-gradient(135deg, #7f1d1d, #450a0a)'
            : flash.kind === 'bye' ? 'linear-gradient(135deg, #1d4ed8, #1e3a8a)'
            : `linear-gradient(135deg, ${GREEN}, #003d20)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16,
        }}
          onClick={() => setFlash(null)}>
          {flash.photoUrl && (
            <img src={flash.photoUrl} alt="" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.4)' }} />
          )}
          <div style={{ fontSize: 20 }}>{flash.kind === 'error' ? '⚠️' : flash.kind === 'bye' ? '👋' : '✅'}</div>
          <div style={{ fontSize: 42, fontWeight: 900, color: 'white', textAlign: 'center' }}>{flash.text}</div>
          {flash.sub && <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>{flash.sub}</div>}
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 11, color: '#4d6d5b', marginTop: 16 }}>
        <a href="/log" style={{ color: '#4d6d5b' }}>View log</a>
        {' · '}
        <a href="/summary" style={{ color: '#4d6d5b' }}>My hours</a>
        {' · '}
        <a href="/manager" style={{ color: '#4d6d5b' }}>Manager</a>
      </div>
    </div>
  )
}
