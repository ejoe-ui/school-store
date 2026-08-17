'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Approvals from './components/Approvals'
import TotalsPoints from './components/TotalsPoints'
import Schedule from './components/Schedule'
import Swaps from './components/Swaps'
import Roster from './components/Roster'

const GREEN = '#006938'
const TABS = [
  { key: 'approvals', label: 'Approvals' },
  { key: 'totals',    label: 'Totals & Points' },
  { key: 'schedule',  label: 'Schedule' },
  { key: 'swaps',     label: 'Swaps' },
  { key: 'roster',    label: 'Roster' },
]

export default function ManagerPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [tab, setTab] = useState('approvals')
  const [employees, setEmployees] = useState([])

  // students.id is not unique on its own (composite PK with period), so we
  // can't rely on a PostgREST embedded FK relationship — fetch and merge
  // manually instead.
  const loadEmployees = useCallback(async () => {
    const { data: emps } = await supabase
      .from('store_employees')
      .select('*')
      .order('name')
    const ids = [...new Set((emps || []).map(e => e.student_id).filter(Boolean))]
    let byId = {}
    if (ids.length) {
      const { data: studs } = await supabase
        .from('students')
        .select('id, full_name, photo_file')
        .in('id', ids)
      ;(studs || []).forEach(s => { if (!byId[s.id]) byId[s.id] = s })
    }
    setEmployees((emps || []).map(e => ({ ...e, students: e.student_id ? byId[e.student_id] || null : null })))
  }, [])

  useEffect(() => { if (unlocked) loadEmployees() }, [unlocked, loadEmployees])

  async function handlePinSubmit(e) {
    e.preventDefault()
    const { data } = await supabase.from('store_settings').select('value').eq('key', 'manager_pin').single()
    if (data?.value === pin) {
      setUnlocked(true)
      setPinError(false)
    } else {
      setPinError(true)
      setTimeout(() => setPinError(false), 1500)
    }
  }

  if (!unlocked) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0b1f16', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, sans-serif',
      }}>
        <div style={{ fontSize: 13, letterSpacing: '0.15em', color: '#8fae9c', textTransform: 'uppercase', marginBottom: 8 }}>
          RHS School Store
        </div>
        <h1 style={{ color: 'white', margin: '0 0 20px' }}>Manager Login</h1>
        <form onSubmit={handlePinSubmit} style={{ display: 'flex', gap: 10 }}>
          <input
            type="password" inputMode="numeric" maxLength={6} autoFocus
            value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN"
            style={{
              padding: '12px 16px', fontSize: 18, borderRadius: 10, border: pinError ? '2px solid #ef4444' : '2px solid #274a37',
              background: '#122a1f', color: 'white', width: 140, textAlign: 'center', letterSpacing: '0.2em',
            }}
          />
          <button type="submit" style={{
            padding: '12px 20px', fontSize: 15, fontWeight: 700, borderRadius: 10, border: 'none',
            background: GREEN, color: 'white', cursor: 'pointer',
          }}>
            Unlock
          </button>
        </form>
        {pinError && <p style={{ color: '#f87171', marginTop: 12, fontSize: 13 }}>Incorrect PIN</p>}
        <a href="/" style={{ marginTop: 28, color: '#4d6d5b', fontSize: 13 }}>← Back to kiosk</a>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ background: GREEN, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: '#bfe3cf', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>RHS School Store</div>
          <div style={{ color: 'white', fontSize: 20, fontWeight: 800 }}>Manager Dashboard</div>
        </div>
        <a href="/" style={{ color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Back to kiosk</a>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '14px 24px 0', borderBottom: '1px solid #e5e7eb', background: 'white' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: tab === t.key ? GREEN : '#6b7280',
              borderBottom: tab === t.key ? `3px solid ${GREEN}` : '3px solid transparent',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        {tab === 'approvals' && <Approvals employees={employees} />}
        {tab === 'totals'    && <TotalsPoints employees={employees} />}
        {tab === 'schedule'  && <Schedule employees={employees} />}
        {tab === 'swaps'     && <Swaps employees={employees} />}
        {tab === 'roster'    && <Roster employees={employees} onChange={loadEmployees} />}
      </div>
    </div>
  )
}
