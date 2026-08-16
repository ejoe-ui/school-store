'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtTime, fmtDuration, minutesBetween } from '../../lib/time'

const GREEN = '#006938'

const STATUS_CFG = {
  pending:  { label: 'Pending',  bg: '#FFFBEB', fg: '#92400E' },
  approved: { label: 'Approved', bg: '#ECFDF5', fg: '#065F46' },
  rejected: { label: 'Rejected', bg: '#FEF2F2', fg: '#991B1B' },
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function LogPage() {
  const [date, setDate] = useState(todayStr())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const dayStart = new Date(`${date}T00:00:00`).toISOString()
    const dayEnd   = new Date(`${date}T23:59:59.999`).toISOString()

    const { data } = await supabase
      .from('store_shifts')
      .select('*, store_employees(name)')
      .gte('clock_in_at', dayStart)
      .lte('clock_in_at', dayEnd)
      .order('clock_in_at', { ascending: false })

    setRows(data || [])
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: 24, fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: GREEN }}>Punch Clock — Activity Log</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>Open log — anyone can check their own punches here.</p>
          </div>
          <a href="/" style={{ color: GREEN, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Back to kiosk</a>
        </div>

        <div style={{ marginBottom: 16 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        </div>

        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>Employee</th>
                <th style={{ padding: '10px 14px' }}>Clock in</th>
                <th style={{ padding: '10px 14px' }}>Clock out</th>
                <th style={{ padding: '10px 14px' }}>Duration</th>
                <th style={{ padding: '10px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No activity for this date.</td></tr>
              )}
              {rows.map(r => {
                const cfg = STATUS_CFG[r.status] || STATUS_CFG.pending
                const mins = r.clock_out_at ? minutesBetween(r.clock_in_at, r.clock_out_at) : minutesBetween(r.clock_in_at, new Date())
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.store_employees?.name || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{fmtTime(r.clock_in_at)}</td>
                    <td style={{ padding: '10px 14px' }}>{r.clock_out_at ? fmtTime(r.clock_out_at) : <span style={{ color: GREEN, fontWeight: 600 }}>In progress</span>}</td>
                    <td style={{ padding: '10px 14px' }}>{fmtDuration(mins)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8,
                        background: cfg.bg, color: cfg.fg, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
