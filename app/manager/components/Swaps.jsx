'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { fmtDate } from '../../../lib/time'

const GREEN = '#006938'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Swaps({ employees }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    date: todayStr(), original_employee_id: '', covering_employee_id: '',
    start_time: '15:30', end_time: '17:30', note: '',
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('store_swaps')
      .select('*, covering:store_employees!covering_employee_id(name), original:store_employees!original_employee_id(name)')
      .gte('date', todayStr())
      .order('date')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addSwap(e) {
    e.preventDefault()
    if (!form.covering_employee_id) return
    setSaving(true)
    await supabase.from('store_swaps').insert({
      date: form.date,
      original_employee_id: form.original_employee_id || null,
      covering_employee_id: form.covering_employee_id,
      start_time: form.start_time,
      end_time: form.end_time,
      note: form.note || null,
    })
    setSaving(false)
    setForm(f => ({ ...f, note: '' }))
    load()
  }

  async function removeSwap(id) {
    await supabase.from('store_swaps').delete().eq('id', id)
    load()
  }

  return (
    <div>
      <form onSubmit={addSwap} style={{
        display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap',
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20,
      }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Date
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Covering for (optional)
          <select value={form.original_employee_id} onChange={e => setForm(f => ({ ...f, original_employee_id: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', minWidth: 150 }}>
            <option value="">— extra shift, no swap —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Covering employee
          <select value={form.covering_employee_id} onChange={e => setForm(f => ({ ...f, covering_employee_id: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', minWidth: 150 }}>
            <option value="">— select —</option>
            {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Start
          <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          End
          <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280', flex: 1, minWidth: 140 }}>
          Note
          <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="optional"
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', width: '100%', boxSizing: 'border-box' }} />
        </label>
        <button type="submit" disabled={saving || !form.covering_employee_id} style={{
          padding: '9px 16px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
          fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !form.covering_employee_id ? 0.5 : 1,
        }}>
          {saving ? 'Adding…' : '+ Add swap'}
        </button>
      </form>

      {loading ? <p style={{ color: '#9ca3af' }}>Loading…</p> : (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px' }}>Date</th>
                <th style={{ padding: '10px 14px' }}>Covering employee</th>
                <th style={{ padding: '10px 14px' }}>Time</th>
                <th style={{ padding: '10px 14px' }}>Details</th>
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No upcoming swaps.</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 14px' }}>{fmtDate(r.date)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.covering?.name}</td>
                  <td style={{ padding: '10px 14px' }}>{r.start_time}–{r.end_time}</td>
                  <td style={{ padding: '10px 14px', color: '#6b7280' }}>
                    {r.original?.name ? `covering ${r.original.name}` : 'extra shift'}{r.note ? ` · ${r.note}` : ''}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => removeSwap(r.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
