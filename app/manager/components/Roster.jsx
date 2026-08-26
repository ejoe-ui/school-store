'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { decimalToHexUid } from '../../../lib/nfc'
import { searchStudents } from '../../../lib/students'
import QRCode from 'qrcode'

const GREEN = '#006938'

export default function Roster({ employees, onChange, currentManagerId }) {
  const [form, setForm] = useState({ name: '', email: '', nfcInput: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editNfcInput, setEditNfcInput] = useState('')
  const [editError, setEditError] = useState('')

  const [qrEmployee, setQrEmployee] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  // ── Name (inline edit on existing rows) ────────────────────────────────
  const [editingNameId, setEditingNameId] = useState(null)
  const [editNameInput, setEditNameInput] = useState('')
  const [editNameError, setEditNameError] = useState('')

  function startEditName(emp) {
    setEditingNameId(emp.id)
    setEditNameInput(emp.name || '')
    setEditNameError('')
  }

  async function saveName(emp) {
    setEditNameError('')
    const value = editNameInput.trim()
    if (!value) { setEditNameError('Name cannot be empty.'); return }
    const { error: updateErr } = await supabase
      .from('store_employees')
      .update({ name: value })
      .eq('id', emp.id)
    if (updateErr) { setEditNameError(updateErr.message); return }
    setEditingNameId(null)
    onChange()
  }

  // ── Email (inline edit on existing rows) ──────────────────────────────
  const [editingEmailId, setEditingEmailId] = useState(null)
  const [editEmailInput, setEditEmailInput] = useState('')
  const [editEmailError, setEditEmailError] = useState('')

  function startEditEmail(emp) {
    setEditingEmailId(emp.id)
    setEditEmailInput(emp.email || '')
    setEditEmailError('')
  }

  async function saveEmail(emp) {
    setEditEmailError('')
    const value = editEmailInput.trim()
    const { error: updateErr } = await supabase
      .from('store_employees')
      .update({ email: value || null })
      .eq('id', emp.id)
    if (updateErr) { setEditEmailError(updateErr.message); return }
    setEditingEmailId(null)
    onChange()
  }

  // ── PIN (manager can set directly, in addition to Reset) ──────────────
  const [editingPinId, setEditingPinId] = useState(null)
  const [editPinInput, setEditPinInput] = useState('')
  const [editPinError, setEditPinError] = useState('')

  function startEditPin(emp) {
    setEditingPinId(emp.id)
    setEditPinInput('')
    setEditPinError('')
  }

  async function savePin(emp) {
    setEditPinError('')
    const digits = editPinInput.trim()
    if (!/^\d{4}$/.test(digits)) { setEditPinError('PIN must be exactly 4 digits.'); return }
    const { error: updateErr } = await supabase
      .from('store_employees')
      .update({ pin: digits })
      .eq('id', emp.id)
    if (updateErr) { setEditPinError(updateErr.message); return }
    setEditingPinId(null)
    onChange()
  }

  // ── Photo (manual upload override — used when there's no linked
  // student record, or the linked student's Lifetouch photo is missing) ─
  const fileInputRef = useRef(null)
  const [pendingUploadEmp, setPendingUploadEmp] = useState(null)
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [photoUrls, setPhotoUrls] = useState({})

  useEffect(() => {
    let cancelled = false
    async function loadThumbs() {
      const entries = await Promise.all((employees || []).map(async emp => {
        const file = emp.photo_file || emp.students?.photo_file
        if (!file) return [emp.id, null]
        const { data } = await supabase.storage.from('student-photos').createSignedUrl(file, 300)
        return [emp.id, data?.signedUrl || null]
      }))
      if (!cancelled) setPhotoUrls(Object.fromEntries(entries))
    }
    loadThumbs()
    return () => { cancelled = true }
  }, [employees])

  function triggerUpload(emp) {
    setUploadError('')
    setPendingUploadEmp(emp)
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pendingUploadEmp) return
    setUploadingId(pendingUploadEmp.id)
    setUploadError('')

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `manual/${pendingUploadEmp.id}-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('student-photos').upload(path, file, { upsert: true })
    if (uploadErr) {
      setUploadError(uploadErr.message)
      setUploadingId(null)
      return
    }
    const { error: updateErr } = await supabase
      .from('store_employees')
      .update({ photo_file: path })
      .eq('id', pendingUploadEmp.id)
    setUploadingId(null)
    if (updateErr) { setUploadError(updateErr.message); return }
    setPendingUploadEmp(null)
    onChange()
  }

  async function removePhoto(emp) {
    if (!confirm(`Remove ${emp.name}'s uploaded photo? (This only removes the manual upload — a linked student's photo, if any, will show instead.)`)) return
    await supabase.from('store_employees').update({ photo_file: null }).eq('id', emp.id)
    onChange()
  }

  // ── Student link (add form) ──────────────────────────────────────────
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)

  async function handleStudentSearch(q) {
    setStudentQuery(q)
    setSelectedStudent(null)
    if (q.trim().length < 2) { setStudentResults([]); return }
    const results = await searchStudents(q)
    setStudentResults(results)
  }

  function pickStudent(s) {
    setSelectedStudent(s)
    setStudentQuery(s.full_name)
    setStudentResults([])
  }

  // ── Student link (inline edit on existing rows) ──────────────────────
  const [editingStudentId, setEditingStudentId] = useState(null)
  const [editStudentQuery, setEditStudentQuery] = useState('')
  const [editStudentResults, setEditStudentResults] = useState([])
  const [editSelectedStudent, setEditSelectedStudent] = useState(null)
  const [editStudentError, setEditStudentError] = useState('')

  function startEditStudent(emp) {
    setEditingStudentId(emp.id)
    setEditStudentQuery(emp.students?.full_name || '')
    setEditStudentResults([])
    setEditSelectedStudent(emp.students || null)
    setEditStudentError('')
  }

  async function handleEditStudentSearch(q) {
    setEditStudentQuery(q)
    setEditSelectedStudent(null)
    if (q.trim().length < 2) { setEditStudentResults([]); return }
    const results = await searchStudents(q)
    setEditStudentResults(results)
  }

  function pickEditStudent(s) {
    setEditSelectedStudent(s)
    setEditStudentQuery(s.full_name)
    setEditStudentResults([])
  }

  async function saveStudentLink(emp) {
    setEditStudentError('')
    const { error: updateErr } = await supabase
      .from('store_employees')
      .update({ student_id: editSelectedStudent?.id || null })
      .eq('id', emp.id)
    if (updateErr) { setEditStudentError(updateErr.message); return }
    setEditingStudentId(null)
    onChange()
  }

  function unlinkStudent() {
    setEditSelectedStudent(null)
    setEditStudentQuery('')
  }

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
      student_id: selectedStudent?.id || null,
      active: true,
    })
    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }
    setForm({ name: '', email: '', nfcInput: '' })
    setStudentQuery('')
    setSelectedStudent(null)
    setStudentResults([])
    onChange()
  }

  async function toggleActive(emp) {
    await supabase.from('store_employees').update({ active: !emp.active }).eq('id', emp.id)
    onChange()
  }

  // ── Manager access (who can log into /manager) ─────────────────────────
  async function toggleManager(emp) {
    if (emp.id === currentManagerId && emp.is_manager) {
      alert("You can't remove your own manager access — ask another manager to do it.")
      return
    }
    await supabase.from('store_employees').update({ is_manager: !emp.is_manager }).eq('id', emp.id)
    onChange()
  }

  // QR badges just encode the employee's id — the kiosk's QR scanner looks
  // it straight back up via resolveEmployeeById, no extra token needed.
  async function showQr(emp) {
    const url = await QRCode.toDataURL(emp.id, { width: 260, margin: 1 })
    setQrDataUrl(url)
    setQrEmployee(emp)
  }

  async function resetPin(emp) {
    if (!confirm(`Reset ${emp.name}'s PIN? They'll be asked to choose a new one next time they clock in or out.`)) return
    await supabase.from('store_employees').update({ pin: null }).eq('id', emp.id)
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
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} style={{ display: 'none' }} />

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
        <label style={{ fontSize: 12, color: '#6b7280', position: 'relative' }}>
          Link to student (optional)
          <input type="text" value={studentQuery} onChange={e => handleStudentSearch(e.target.value)}
            placeholder="Search by name" autoComplete="off"
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: selectedStudent ? `1px solid ${GREEN}` : '1px solid #d1d5db', minWidth: 180 }} />
          {studentResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 2,
              background: 'white', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              maxHeight: 180, overflowY: 'auto',
            }}>
              {studentResults.map(s => (
                <div key={s.id} onClick={() => pickStudent(s)} style={{
                  padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                }}>
                  {s.full_name}
                </div>
              ))}
            </div>
          )}
          {selectedStudent && (
            <div style={{ fontSize: 11, color: GREEN, marginTop: 4 }}>✓ Linked to {selectedStudent.full_name}</div>
          )}
        </label>
        <button type="submit" disabled={saving || !form.name.trim()} style={{
          padding: '9px 16px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
          fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: !form.name.trim() ? 0.5 : 1,
        }}>
          {saving ? 'Adding…' : '+ Add employee'}
        </button>
        {error && <p style={{ width: '100%', color: '#991b1b', fontSize: 13, margin: '4px 0 0' }}>⚠️ {error}</p>}
      </form>

      {uploadError && (
        <p style={{ color: '#991b1b', fontSize: 13, margin: '0 0 10px' }}>⚠️ Photo upload failed: {uploadError}</p>
      )}

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>Name</th>
              <th style={{ padding: '10px 14px' }}>Email</th>
              <th style={{ padding: '10px 14px' }}>NFC card</th>
              <th style={{ padding: '10px 14px' }}>Student photo link</th>
              <th style={{ padding: '10px 14px' }}>Photo</th>
              <th style={{ padding: '10px 14px' }}>PIN</th>
              <th style={{ padding: '10px 14px' }}>QR badge</th>
              <th style={{ padding: '10px 14px' }}>Status</th>
              <th style={{ padding: '10px 14px' }}>Manager access</th>
              <th style={{ padding: '10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No employees yet.</td></tr>
            )}
            {employees.map(emp => (
              <tr key={emp.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                  {editingNameId === emp.id ? (
                    <div>
                      <input type="text" autoFocus value={editNameInput} onChange={e => setEditNameInput(e.target.value)}
                        placeholder="Full name" autoComplete="off"
                        style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 160, fontWeight: 400 }} />
                      <button onClick={() => saveName(emp)} style={{
                        marginLeft: 6, padding: '6px 10px', borderRadius: 6, border: 'none', background: GREEN,
                        color: 'white', fontSize: 12, cursor: 'pointer',
                      }}>Save</button>
                      <button onClick={() => setEditingNameId(null)} style={{
                        marginLeft: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white',
                        color: '#6b7280', fontSize: 12, cursor: 'pointer',
                      }}>Cancel</button>
                      {editNameError && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 4, fontWeight: 400 }}>⚠️ {editNameError}</div>}
                    </div>
                  ) : (
                    <span>
                      {emp.name}
                      <button onClick={() => startEditName(emp)} style={{
                        marginLeft: 8, border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Edit</button>
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', color: '#6b7280' }}>
                  {editingEmailId === emp.id ? (
                    <div>
                      <input type="email" autoFocus value={editEmailInput} onChange={e => setEditEmailInput(e.target.value)}
                        placeholder="name@example.com" autoComplete="off"
                        style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 170 }} />
                      <button onClick={() => saveEmail(emp)} style={{
                        marginLeft: 6, padding: '6px 10px', borderRadius: 6, border: 'none', background: GREEN,
                        color: 'white', fontSize: 12, cursor: 'pointer',
                      }}>Save</button>
                      <button onClick={() => setEditingEmailId(null)} style={{
                        marginLeft: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white',
                        color: '#6b7280', fontSize: 12, cursor: 'pointer',
                      }}>Cancel</button>
                      {editEmailError && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 4 }}>⚠️ {editEmailError}</div>}
                    </div>
                  ) : (
                    <span>
                      {emp.email || '—'}
                      <button onClick={() => startEditEmail(emp)} style={{
                        marginLeft: 8, border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>{emp.email ? 'Edit' : 'Add'}</button>
                    </span>
                  )}
                </td>
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
                <td style={{ padding: '10px 14px', position: 'relative' }}>
                  {editingStudentId === emp.id ? (
                    <div>
                      <input type="text" autoFocus value={editStudentQuery} onChange={e => handleEditStudentSearch(e.target.value)}
                        placeholder="Search by name" autoComplete="off"
                        style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 170 }} />
                      {editStudentResults.length > 0 && (
                        <div style={{
                          position: 'absolute', zIndex: 10, marginTop: 2,
                          background: 'white', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          maxHeight: 160, overflowY: 'auto', width: 200,
                        }}>
                          {editStudentResults.map(s => (
                            <div key={s.id} onClick={() => pickEditStudent(s)} style={{
                              padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                            }}>
                              {s.full_name}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <button onClick={() => saveStudentLink(emp)} style={{
                          padding: '6px 10px', borderRadius: 6, border: 'none', background: GREEN,
                          color: 'white', fontSize: 12, cursor: 'pointer',
                        }}>Save</button>
                        <button onClick={() => setEditingStudentId(null)} style={{
                          marginLeft: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white',
                          color: '#6b7280', fontSize: 12, cursor: 'pointer',
                        }}>Cancel</button>
                        {editSelectedStudent && (
                          <button onClick={unlinkStudent} style={{
                            marginLeft: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white',
                            color: '#991b1b', fontSize: 12, cursor: 'pointer',
                          }}>Unlink</button>
                        )}
                      </div>
                      {editStudentError && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 4 }}>⚠️ {editStudentError}</div>}
                    </div>
                  ) : (
                    <span>
                      {emp.students?.full_name
                        ? <span style={{ color: GREEN, fontWeight: 600 }}>{emp.students.full_name}</span>
                        : <span style={{ color: '#c1c9d2' }}>Not linked</span>}
                      <button onClick={() => startEditStudent(emp)} style={{
                        marginLeft: 8, border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>{emp.students?.full_name ? 'Change' : 'Link'}</button>
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {photoUrls[emp.id] ? (
                      <img src={photoUrls[emp.id]} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', background: '#f3f4f6', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#c1c9d2',
                      }}>—</div>
                    )}
                    <div style={{ fontSize: 12 }}>
                      {emp.photo_file ? (
                        <span style={{ color: GREEN, fontWeight: 600, display: 'block' }}>Custom upload</span>
                      ) : emp.students?.photo_file ? (
                        <span style={{ color: '#6b7280', display: 'block' }}>From student record</span>
                      ) : (
                        <span style={{ color: '#c1c9d2', display: 'block' }}>No photo</span>
                      )}
                      <span>
                        <button onClick={() => triggerUpload(emp)} disabled={uploadingId === emp.id} style={{
                          border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                        }}>
                          {uploadingId === emp.id ? 'Uploading…' : emp.photo_file ? 'Replace' : 'Upload'}
                        </button>
                        {emp.photo_file && (
                          <button onClick={() => removePhoto(emp)} style={{
                            marginLeft: 8, border: 'none', background: 'none', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                          }}>Remove</button>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {editingPinId === emp.id ? (
                    <div>
                      <input type="text" inputMode="numeric" maxLength={4} autoFocus
                        value={editPinInput} onChange={e => setEditPinInput(e.target.value.replace(/\D/g, ''))}
                        placeholder="4 digits" autoComplete="off"
                        style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, width: 80, letterSpacing: '0.15em' }} />
                      <button onClick={() => savePin(emp)} style={{
                        marginLeft: 6, padding: '6px 10px', borderRadius: 6, border: 'none', background: GREEN,
                        color: 'white', fontSize: 12, cursor: 'pointer',
                      }}>Save</button>
                      <button onClick={() => setEditingPinId(null)} style={{
                        marginLeft: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white',
                        color: '#6b7280', fontSize: 12, cursor: 'pointer',
                      }}>Cancel</button>
                      {editPinError && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 4 }}>⚠️ {editPinError}</div>}
                    </div>
                  ) : emp.pin ? (
                    <span>
                      <span style={{ color: GREEN, fontWeight: 700, fontSize: 13, letterSpacing: '0.1em' }}>●●●●</span>
                      <button onClick={() => startEditPin(emp)} style={{
                        marginLeft: 8, border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Change</button>
                      <button onClick={() => resetPin(emp)} style={{
                        marginLeft: 6, border: 'none', background: 'none', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Reset</button>
                    </span>
                  ) : (
                    <span>
                      <span style={{ color: '#c1c9d2', fontSize: 12 }}>Not set yet</span>
                      <button onClick={() => startEditPin(emp)} style={{
                        marginLeft: 8, border: 'none', background: 'none', color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>Set PIN</button>
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => showQr(emp)} style={{
                    border: '1px solid #d1d5db', background: 'white', borderRadius: 6, padding: '5px 10px',
                    color: GREEN, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Show / print</button>
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
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 8,
                    background: emp.is_manager ? '#EFF6FF' : '#F3F4F6', color: emp.is_manager ? '#1D4ED8' : '#6b7280',
                    textTransform: 'uppercase',
                  }}>
                    {emp.is_manager ? 'Manager' : 'Staff'}
                  </span>
                  <button
                    onClick={() => toggleManager(emp)}
                    disabled={emp.id === currentManagerId && emp.is_manager}
                    title={emp.id === currentManagerId && emp.is_manager ? "You can't remove your own manager access" : undefined}
                    style={{
                      marginLeft: 8, border: 'none', background: 'none', fontSize: 12, fontWeight: 600,
                      color: emp.id === currentManagerId && emp.is_manager ? '#c1c9d2' : (emp.is_manager ? '#ef4444' : GREEN),
                      cursor: emp.id === currentManagerId && emp.is_manager ? 'not-allowed' : 'pointer',
                    }}>
                    {emp.is_manager ? 'Revoke' : 'Grant'}
                  </button>
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

      {qrEmployee && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, textAlign: 'center', width: 320 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{qrEmployee.name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>School Store QR Badge</div>
            {qrDataUrl && <img src={qrDataUrl} alt="QR code" style={{ width: 220, height: 220 }} />}
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
              Print and laminate, or have them save it to their phone as a backup if they forget their card.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
              <button onClick={() => window.print()} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
                fontWeight: 600, cursor: 'pointer',
              }}>Print</button>
              <button onClick={() => setQrEmployee(null)} style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white',
                color: '#6b7280', cursor: 'pointer',
              }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
