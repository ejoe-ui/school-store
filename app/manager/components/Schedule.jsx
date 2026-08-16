'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { DAY_NAMES } from '../../../lib/time'

const GREEN = '#006938'

export default function Schedule({ employees }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ employee_id: '', day_of_week: '1', start_time: '15:30', end_time: '17:30' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('store_schedule')
      .select('*, store_employees(name)')
      .order('day_of_week').order('start_time')
    setRows(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addShift(e) {
    e.preventDefault()
    if (!form.employee_id) return
    setSaving(true)
    await supabase.from('store_schedule').insert({
      employee_id: form.employee_id,
      day_of_week: parseInt(form.day_of_week, 10),
      start_time: form.start_time,
      end_time: form.end_time,
    })
    setSaving(false)
    load()
  }

  async function removeShift(id) {
    await supabase.from('store_schedule').delete().eq('id', id)
    load()
  }

  const byDay = DAY_NAMES.map((name, i) => ({
    name, rows: rows.filter(r => r.day_of_week === i),
  }))

  return (
    <div>
      <form onSubmit={addShift} style={{
        display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap',
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20,
      }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Employee
          <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', minWidth: 160 }}>
            <option value="">— select —</option>
            {employees.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Day
          <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }}>
            {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
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
        <button type="submit" disabled={saving || !form.employee_id} style={{
          padding: '9px 16px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
          fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !form.employee_id ? 0.5 : 1,
        }}>
          {saving ? 'Adding…' : '+ Add shift'}
        </button>
      </form>

      {loading ? <p style={{ color: '#9ca3af' }}>Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {byDay.map(d => (
            <div key={d.name} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: d.rows.length ? 8 : 0, color: GREEN }}>{d.name}</div>
              {d.rows.length === 0 && <div style={{ fontSize: 13, color: '#c1c9d2' }}>No shifts</div>}
              {d.rows.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 14 }}>
                    <strong>{r.store_employees?.name}</strong>
                    <span style={{ color: '#9ca3af', marginLeft: 8 }}>{r.start_time}–{r.end_time}</span>
                  </div>
                  <button onClick={() => removeShift(r.id)} style={{
                    border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13,
                  }}>Remove</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
