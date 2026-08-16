'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { fmtDate, fmtDuration, minutesBetween } from '../../../lib/time'

const GREEN = '#006938'

function toLocalInputValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Approvals({ employees }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState({}) // shift id -> { clock_in_at, clock_out_at }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('store_shifts')
      .select('*, store_employees(name)')
      .eq('status', 'pending')
      .not('clock_out_at', 'is', null)
      .order('clock_in_at', { ascending: true })
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function setEdit(id, field, value) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function approve(row) {
    const edit = edits[row.id] || {}
    const clockIn  = edit.clock_in_at  ? new Date(edit.clock_in_at).toISOString()  : row.clock_in_at
    const clockOut = edit.clock_out_at ? new Date(edit.clock_out_at).toISOString() : row.clock_out_at
    const corrected = !!(edit.clock_in_at || edit.clock_out_at)

    await supabase.from('store_shifts').update({
      clock_in_at: clockIn,
      clock_out_at: clockOut,
      status: 'approved',
      approved_by: 'Manager',
      approved_at: new Date().toISOString(),
      corrected,
    }).eq('id', row.id)

    load()
  }

  async function reject(row) {
    await supabase.from('store_shifts').update({
      status: 'rejected', approved_by: 'Manager', approved_at: new Date().toISOString(),
    }).eq('id', row.id)
    load()
  }

  if (loading) return <p style={{ color: '#9ca3af' }}>Loading…</p>
  if (rows.length === 0) return <p style={{ color: '#9ca3af' }}>No shifts waiting for approval. 🎉</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(row => {
        const edit = edits[row.id] || {}
        const clockInVal  = edit.clock_in_at  ?? toLocalInputValue(row.clock_in_at)
        const clockOutVal = edit.clock_out_at ?? toLocalInputValue(row.clock_out_at)
        const mins = minutesBetween(
          edit.clock_in_at ? new Date(edit.clock_in_at) : row.clock_in_at,
          edit.clock_out_at ? new Date(edit.clock_out_at) : row.clock_out_at
        )
        return (
          <div key={row.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{row.store_employees?.name || '—'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(row.clock_in_at)} · {fmtDuration(mins)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => reject(row)} style={{
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fef2f2',
                  color: '#991b1b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>Reject</button>
                <button onClick={() => approve(row)} style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', background: GREEN,
                  color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>Approve</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ fontSize: 12, color: '#6b7280' }}>
                Clock in
                <input type="datetime-local" value={clockInVal}
                  onChange={e => setEdit(row.id, 'clock_in_at', e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
              </label>
              <label style={{ fontSize: 12, color: '#6b7280' }}>
                Clock out
                <input type="datetime-local" value={clockOutVal}
                  onChange={e => setEdit(row.id, 'clock_out_at', e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
