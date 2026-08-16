'use client'
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { decimalToHexUid } from '../../../lib/nfc'

const GREEN = '#006938'

export default function Roster({ employees, onChange }) {
  const [form, setForm] = useState({ name: '', email: '', nfcInput: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editNfcInput, setEditNfcInput] = useState('')
  const [editError, setEditError] = useState('')

  async function addEmployee(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError('')

    let nfcUid = null
    if (form.nfcInput.trim()) {
      nfcUid = decimalToHexUid(form.nfcInput)
      const { data: dupe } = await supabase
        .from('store_employees').select('id, name').eq('nfc_uid', nfcUid).maybeSingle()
      if (dupe) {
        setError(`That card is already assigned to ${dupe.name}.`)
        setSaving(false)
        return
      }
    }

    const { error: insertErr } = await supabase.from('store_employees').insert({
      name: form.name.trim(),
      email: form.email.trim() || null,
      nfc_uid: nfcUid,
      active: true,
    })
    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }
    setForm({ name: '', email: '', nfcInput: '' })
    onChange()
  }

  async function toggleActive(emp) {
    await supabase.from('store_employees').update({ active: !emp.active }).eq('id', emp.id)
    onChange()
  }

  function startEditNfc(emp) {
    setEditingId(emp.id)
    setEditNfcInput('')
    setEditError('')
  }

  async function saveNfc(emp) {
    setEditError('')
    if (!editNfcInput.trim()) { setEditingId(null); return }
    const hexUid = decimalToHexUid(editNfcInput)
    if (!hexUid) { setEditError('Could not read that ID.'); return }

    const { data: dupe } = await supabase
      .from('store_employees').select('id, name').eq('nfc_uid', hexUid).neq('id', emp.id).maybeSingle()
    if (dupe) {
      setEditError(`That card is already assigned to ${dupe.name}.`)
      return
    }

    const { error: updateErr } = await supabase.from('store_employees').update({ nfc_uid: hexUid }).eq('id', emp.id)
    if (updateErr) { setEditError(updateErr.message); return }
    setEditingId(null)
    onChange()
  }

  return (
    <div>
      <form onSubmit={addEmployee} style={{
        display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap',
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20,
      }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Name
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full name" required
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', minWidth: 160 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          Email (optional)
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', minWidth: 160 }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          NFC card (optional)
          <input type="text" value={form.nfcInput} onChange={e => setForm(f => ({ ...f, nfcInput: e.target.value }))}
            placeholder="Scan or type the ID" autoComplete="off"
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db', minWidth: 160 }} />
        </label>
        <button type="submit" disabled={saving || !form.name.trim()} style={{
          padding: '9px 16px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
          fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !form.name.trim() ? 0.5 : 1,
        }}>
          {saving ? 'Adding…' : '+ Add employee'}
        </button>
        {error && <p style={{ width: '100%', color: '#991b1b', fontSize: 13, margin: '4px 0 0' }}>⚠️ {error}</p>}
      </form>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>Name</th>
              <th style={{ padding: '10px 14px' }}>Email</th>
              <th style={{ padding: '10px 14px' }}>NFC card</th>
              <th style={{ padding: '10px 14px' }}>Status</th>
              <th style={{ padding: '10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No employees yet.</td></tr>
            )}
            {employees.map(emp => (
              <tr key={emp.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{emp.name}</td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>{emp.email || '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  {editingId === emp.id ? (
                    <div>
                      <input type="text" autoFocus value={editNfcInput} onChange={e => setEditNfcInput(e.target.value)}
                        placeholder="Scan or type the ID" autoComplete="off"
                        style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 160 }} />
                      <button onClick={() => saveNfc(emp)} style={{
                        marginLeft: 6, padding: '6px 10px', borderRadius: 6, border: 'none', background: GREEN,
                        color: 'white', fontSize: 12, cursor: 'pointer',
                      }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{
                        marginLeft: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white',
                        color: '#6b7280', fontSize: 12, cursor: 'pointer',
                      }}>Cancel</button>
                      {editError && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 4 }}>⚠️ {editError}</div>}
                    </div>
                  ) : (
                    <span>
                      {emp.nfc_uid ? <code style={{ fontSize: 12 }}>{emp.nfc_uid}</code> : <span style={{ color: '#c1c9d2' }}>No card</span>}
                      <button onClick={() => startEditNfc(emp)} style={{
                        marginLeft: 8, border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>{emp.nfc_uid ? 'Replace' : 'Assign'}</button>
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8,
                    background: emp.active ? '#ECFDF5' : '#F3F4F6', color: emp.active ? '#065F46' : '#6b7280',
                    textTransform: 'uppercase',
                  }}>
                    {emp.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => toggleActive(emp)} style={{
                    border: 'none', background: 'none', color: emp.active ? '#ef4444' : GREEN, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                  }}>
                    {emp.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
