'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { resolveEmployee } from '../../lib/nfc'
import { fmtDate, fmtTime, fmtDuration, minutesBetween } from '../../lib/time'
import NfcListener from '../../components/NfcListener'

const GREEN = '#006938'

const PERIODS = [
  { key: 'month',     label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'quarter',   label: 'This quarter' },
  { key: 'allTime',   label: 'All time' },
]

function getRange(periodKey) {
  const now = new Date()
  if (periodKey === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }
  if (periodKey === 'lastMonth') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return {
      from,
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
      label: from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }
  if (periodKey === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1)
    return {
      from,
      to: new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59),
      label: `Q${q + 1} ${now.getFullYear()}`,
    }
  }
  return { from: new Date(2000, 0, 1), to: new Date(now.getFullYear() + 1, 0, 1), label: 'All time' }
}

export default function SummaryPage() {
  const [employee, setEmployee] = useState(null)
  const [error, setError] = useState('')
  const [manualId, setManualId] = useState('')
  const [allEmployees, setAllEmployees] = useState([])
  const [periodKey, setPeriodKey] = useState('month')
  const [shifts, setShifts] = useState([])
  const [pointsPerHour, setPointsPerHour] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('store_employees').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setAllEmployees(data || []))
    supabase.from('store_settings').select('value').eq('key', 'points_per_hour').single()
      .then(({ data }) => { if (data?.value) setPointsPerHour(parseFloat(data.value) || 1) })
  }, [])

  const handleScan = useCallback(async (rawUid) => {
    setError('')
    const emp = await resolveEmployee(rawUid)
    if (!emp) { setError('Card not recognized.'); return }
    setEmployee(emp)
  }, [])

  const range = getRange(periodKey)

  const loadShifts = useCallback(async () => {
    if (!employee) return
    setLoading(true)
    const { data } = await supabase
      .from('store_shifts')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('status', 'approved')
      .gte('clock_in_at', range.from.toISOString())
      .lte('clock_in_at', range.to.toISOString())
      .order('clock_in_at', { ascending: true })
    setShifts(data || [])
    setLoading(false)
  }, [employee, periodKey])

  useEffect(() => { loadShifts() }, [loadShifts])

  function reset() {
    setEmployee(null)
    setShifts([])
    setError('')
  }

  const totalMins = shifts.reduce((s, r) => s + minutesBetween(r.clock_in_at, r.clock_out_at), 0)
  const totalHours = totalMins / 60
  const totalPoints = Math.round(totalHours * pointsPerHour * 10) / 10

  // ── Not identified yet ────────────────────────────────────────────────
  if (!employee) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0b1f16', color: 'white', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
        fontFamily: '-apple-system, sans-serif', padding: 24, textAlign: 'center',
      }}>
        <NfcListener onScan={handleScan} />
        <div style={{ fontSize: 13, letterSpacing: '0.15em', color: '#8fae9c', textTransform: 'uppercase' }}>
          RHS School Store
        </div>
        <h1 style={{ margin: 0 }}>My Hours</h1>
        <p style={{ color: '#8fae9c', maxWidth: 320 }}>Tap your card to see your hours and points summary.</p>
        {error && <p style={{ color: '#f87171' }}>⚠️ {error}</p>}

        <div style={{ marginTop: 10 }}>
          <select value={manualId} onChange={e => {
            setManualId(e.target.value)
            const emp = allEmployees.find(x => x.id === e.target.value)
            if (emp) setEmployee(emp)
          }} style={{ padding: 10, borderRadius: 8, border: '1px solid #274a37', background: '#122a1f', color: 'white' }}>
            <option value="">— or select your name —</option>
            {allEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <a href="/" style={{ marginTop: 20, color: '#4d6d5b', fontSize: 13 }}>← Back to kiosk</a>
      </div>
    )
  }

  // ── Summary view ─────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, sans-serif' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="no-print" style={{ background: GREEN, padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'white', fontWeight: 700 }}>RHS School Store — My Hours</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => window.print()} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', background: 'white', color: GREEN,
            fontWeight: 700, fontSize: 13, cursor: 'pointer',
          }}>🖨 Print / Save PDF</button>
          <button onClick={reset} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.5)', background: 'transparent',
            color: 'white', fontSize: 13, cursor: 'pointer',
          }}>Not you? Switch</button>
        </div>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 8, padding: '16px 24px 0', maxWidth: 700, margin: '0 auto' }}>
        {PERIODS.map(p => (
          <button key={p.key} onClick={() => setPeriodKey(p.key)} style={{
            padding: '8px 14px', borderRadius: 8, border: `1px solid ${periodKey === p.key ? GREEN : '#d1d5db'}`,
            background: periodKey === p.key ? GREEN : 'white', color: periodKey === p.key ? 'white' : '#374151',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 700, margin: '20px auto', padding: '0 24px 40px' }}>
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, borderBottom: '2px solid #f3f4f6', paddingBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>
                RHS School Store · Hours Summary
              </div>
              <h2 style={{ margin: '0 0 4px', fontSize: 24 }}>{employee.name}</h2>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{range.label}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: GREEN }}>{totalHours.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>hours worked</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>{totalPoints}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>points earned</div>
            </div>
            <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>{shifts.length}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>shifts worked</div>
            </div>
            <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>
                {shifts.length ? fmtDuration(totalMins / shifts.length) : '—'}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>avg shift</div>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Shift breakdown
          </div>
          {loading && <p style={{ color: '#9ca3af' }}>Loading…</p>}
          {!loading && shifts.length === 0 && <p style={{ color: '#9ca3af' }}>No approved shifts for this period.</p>}
          {!loading && shifts.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '6px 8px' }}>Date</th>
                  <th style={{ padding: '6px 8px' }}>In</th>
                  <th style={{ padding: '6px 8px' }}>Out</th>
                  <th style={{ padding: '6px 8px' }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px' }}>{fmtDate(s.clock_in_at)}</td>
                    <td style={{ padding: '6px 8px' }}>{fmtTime(s.clock_in_at)}</td>
                    <td style={{ padding: '6px 8px' }}>{fmtTime(s.clock_out_at)}</td>
                    <td style={{ padding: '6px 8px' }}>{fmtDuration(minutesBetween(s.clock_in_at, s.clock_out_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
