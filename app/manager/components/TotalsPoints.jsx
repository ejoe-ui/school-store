'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { minutesBetween } from '../../../lib/time'

const GREEN = '#006938'

function startOfWeek() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function TotalsPoints({ employees }) {
  const [from, setFrom] = useState(startOfWeek())
  const [to, setTo] = useState(todayStr())
  const [rows, setRows] = useState([])
  const [pointsPerHour, setPointsPerHour] = useState('1')
  const [savingRate, setSavingRate] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadRate = useCallback(async () => {
    const { data } = await supabase.from('store_settings').select('value').eq('key', 'points_per_hour').single()
    if (data?.value) setPointsPerHour(data.value)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const dayStart = new Date(`${from}T00:00:00`).toISOString()
    const dayEnd   = new Date(`${to}T23:59:59.999`).toISOString()

    const { data } = await supabase
      .from('store_shifts')
      .select('employee_id, clock_in_at, clock_out_at')
      .eq('status', 'approved')
      .gte('clock_in_at', dayStart)
      .lte('clock_in_at', dayEnd)

    const totals = {}
    ;(data || []).forEach(s => {
      const mins = minutesBetween(s.clock_in_at, s.clock_out_at)
      totals[s.employee_id] = (totals[s.employee_id] || 0) + mins
    })

    const rate = parseFloat(pointsPerHour) || 0
    const out = employees.map(e => {
      const mins = totals[e.id] || 0
      const hours = mins / 60
      return { id: e.id, name: e.name, hours, points: Math.round(hours * rate * 10) / 10 }
    }).filter(r => r.hours > 0).sort((a, b) => b.hours - a.hours)

    setRows(out)
    setLoading(false)
  }, [from, to, employees, pointsPerHour])

  useEffect(() => { loadRate() }, [loadRate])
  useEffect(() => { load() }, [load])

  async function saveRate() {
    setSavingRate(true)
    await supabase.from('store_settings').update({ value: String(pointsPerHour) }).eq('key', 'points_per_hour')
    setSavingRate(false)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'end', marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          To
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Points per hour
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input type="number" step="0.1" value={pointsPerHour} onChange={e => setPointsPerHour(e.target.value)}
              style={{ width: 70, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
            <button onClick={saveRate} disabled={savingRate} style={{
              padding: '8px 12px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{savingRate ? 'Saving…' : 'Save'}</button>
          </div>
        </label>
      </div>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>Employee</th>
              <th style={{ padding: '10px 14px' }}>Hours</th>
              <th style={{ padding: '10px 14px' }}>Points</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No approved hours in this range.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '10px 14px' }}>{r.hours.toFixed(2)}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: GREEN }}>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>
        Only approved shifts count toward totals and points.
      </p>
    </div>
  )
}
