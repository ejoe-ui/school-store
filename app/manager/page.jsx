'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { attachStudents } from '../../lib/students'
import { resolveEmployee } from '../../lib/nfc'
import PinPad from '../../components/PinPad'
import NfcListener from '../../components/NfcListener'
import Approvals from './components/Approvals'
import TotalsPoints from './components/TotalsPoints'
import Schedule from './components/Schedule'
import Swaps from './components/Swaps'
import Roster from './components/Roster'
import Inventory from './components/Inventory'

const GREEN = '#006938'
const DARK  = '#0b1f16'
const TABS = [
  { key: 'approvals', label: 'Approvals' },
  { key: 'totals',    label: 'Totals & Points' },
  { key: 'schedule',  label: 'Schedule' },
  { key: 'swaps',     label: 'Swaps' },
  { key: 'roster',    label: 'Roster' },
  { key: 'inventory', label: 'Inventory' },
]

function initials(name) {
  return (name || '')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function ManagerPage() {
  const [manager, setManager] = useState(null)
  const [tab, setTab] = useState('approvals')
  const [employees, setEmployees] = useState([])
  const [products, setProducts] = useState([])

  // ── Manager login (PIN or NFC — same gate pattern as Register) ────────
  const [pendingEmployee, setPendingEmployee] = useState(null)
  const [pinMode, setPinMode] = useState(null)   // 'verify' | 'set-first' | 'set-confirm'
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [firstPin, setFirstPin] = useState('')
  const [loginError, setLoginError] = useState('')

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase.from('store_employees').select('*').order('name')
    setEmployees(await attachStudents(data))
  }, [])

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data || [])
  }, [])

  // Employees are needed for the login tile grid too, so load them
  // unconditionally — not just after a manager is signed in.
  useEffect(() => { loadEmployees() }, [loadEmployees])
  useEffect(() => { if (manager) loadProducts() }, [manager, loadProducts])

  const closeLogin = useCallback(() => {
    setPendingEmployee(null)
    setPinMode(null)
    setPinError('')
    setPinBusy(false)
    setAttempts(0)
    setFirstPin('')
  }, [])

  const beginLogin = useCallback((employee) => {
    if (!employee) return
    setLoginError('')
    setPinError('')
    setAttempts(0)
    setFirstPin('')
    setPendingEmployee(employee)
    setPinMode(employee.pin ? 'verify' : 'set-first')
  }, [])

  function admitIfManager(employee) {
    if (employee.is_manager) {
      setManager(employee)
      closeLogin()
    } else {
      setLoginError(`${employee.name} doesn't have manager access yet — ask a manager to turn it on from the Roster tab.`)
      closeLogin()
    }
  }

  const handlePinComplete = useCallback(async (digits) => {
    if (!pendingEmployee) return

    if (pinMode === 'verify') {
      if (digits === pendingEmployee.pin) {
        admitIfManager(pendingEmployee)
        return
      }
      const next = attempts + 1
      if (next >= 3) {
        setLoginError('Too many tries — ask a manager for help with your PIN')
        closeLogin()
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
      setPinBusy(false)
      loadEmployees()
      admitIfManager({ ...pendingEmployee, pin: digits })
    }
  }, [pendingEmployee, pinMode, attempts, firstPin, closeLogin, loadEmployees])

  const handleScan = useCallback(async (rawUid) => {
    const employee = await resolveEmployee(rawUid)
    if (!employee) {
      setLoginError('Card not recognized')
      return
    }
    beginLogin(employee)
  }, [beginLogin])

  function logOut() {
    setManager(null)
    setTab('approvals')
  }

  const pinTitle = pinMode === 'verify'
    ? `Enter your PIN — ${pendingEmployee?.name?.split(' ')[0] || ''}`
    : pinMode === 'set-confirm'
      ? 'Confirm your new PIN'
      : `Choose a PIN — ${pendingEmployee?.name?.split(' ')[0] || ''}`

  const pinSubtitle = pinMode === 'verify'
    ? 'Ask a manager to reset it if you forgot.'
    : pinMode === 'set-confirm'
      ? 'Enter the same 4 digits again to confirm.'
      : 'Pick 4 digits nobody else knows. You’ll use it every time you log in.'

  // ── Not logged in: pick a tile or tap a card ───────────────────────────
  if (!manager) {
    return (
      <div style={{
        minHeight: '100vh', background: DARK, color: 'white',
        display: 'flex', flexDirection: 'column', padding: 24, boxSizing: 'border-box',
      }}>
        <NfcListener onScan={handleScan} disabled={!!pendingEmployee} />

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.15em', color: '#8fae9c', textTransform: 'uppercase' }}>
            RHS School Store
          </div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>Manager Login</div>
          <div style={{ fontSize: 13, color: '#8fae9c', marginTop: 4 }}>
            Tap your card, or tap your name — you'll enter your PIN next
          </div>
        </div>

        {loginError && (
          <div style={{ color: '#f87171', fontSize: 14, fontWeight: 600, marginBottom: 16, maxWidth: 480 }}>{loginError}</div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 14, overflowY: 'auto', paddingRight: 4,
        }}>
          {employees.filter(e => e.active).length === 0 && (
            <div style={{ color: '#8fae9c' }}>No employees yet — add some from the Roster (once you're in).</div>
          )}
          {employees.filter(e => e.active).map(emp => (
            <button
              key={emp.id}
              onClick={() => beginLogin(emp)}
              style={{
                background: '#122a1f', border: '1px solid #1e3a2c',
                borderRadius: 14, padding: '16px 12px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                color: 'white', textAlign: 'center',
              }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#274a37',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 15,
              }}>
                {initials(emp.name)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div>
            </button>
          ))}
        </div>

        {pendingEmployee && pinMode && (
          <PinPad
            key={pinMode + attempts}
            title={pinTitle}
            subtitle={pinSubtitle}
            error={pinError}
            busy={pinBusy}
            onCancel={closeLogin}
            onComplete={handlePinComplete}
          />
        )}

        <a href="/" style={{ marginTop: 'auto', paddingTop: 28, color: '#4d6d5b', fontSize: 13, textAlign: 'center' }}>← Back to kiosk</a>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: '#bfe3cf', fontSize: 13, fontWeight: 600 }}>{manager.name}</div>
          <button onClick={logOut} style={{
            border: 'none', background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 13, fontWeight: 600,
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
          }}>Log out</button>
          <a href="/" style={{ color: 'white', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Back to kiosk</a>
        </div>
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
        {tab === 'roster'    && <Roster employees={employees} onChange={loadEmployees} currentManagerId={manager.id} />}
        {tab === 'inventory' && <Inventory products={products} onChange={loadProducts} />}
      </div>
    </div>
  )
}
