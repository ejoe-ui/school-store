'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const GREEN = '#006938'

export default function Inventory({ products, onChange }) {
  const [form, setForm] = useState({ name: '', price: '', stock: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── Photo (manual upload — same pattern as Roster.jsx, own bucket) ────
  const fileInputRef = useRef(null)
  const [pendingUploadProduct, setPendingUploadProduct] = useState(null)
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [photoUrls, setPhotoUrls] = useState({})

  useEffect(() => {
    let cancelled = false
    async function loadThumbs() {
      const entries = await Promise.all((products || []).map(async product => {
        if (!product.photo_file) return [product.id, null]
        const { data } = await supabase.storage.from('product-photos').createSignedUrl(product.photo_file, 300)
        return [product.id, data?.signedUrl || null]
      }))
      if (!cancelled) setPhotoUrls(Object.fromEntries(entries))
    }
    loadThumbs()
    return () => { cancelled = true }
  }, [products])

  function triggerUpload(product) {
    setUploadError('')
    setPendingUploadProduct(product)
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !pendingUploadProduct) return
    setUploadingId(pendingUploadProduct.id)
    setUploadError('')

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `manual/${pendingUploadProduct.id}-${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('product-photos').upload(path, file, { upsert: true })
    if (uploadErr) {
      setUploadError(uploadErr.message)
      setUploadingId(null)
      return
    }
    const { error: updateErr } = await supabase
      .from('products')
      .update({ photo_file: path })
      .eq('id', pendingUploadProduct.id)
    setUploadingId(null)
    if (updateErr) { setUploadError(updateErr.message); return }
    setPendingUploadProduct(null)
    onChange()
  }

  async function removePhoto(product) {
    if (!confirm(`Remove ${product.name}'s photo?`)) return
    await supabase.from('products').update({ photo_file: null }).eq('id', product.id)
    onChange()
  }

  // ── Name (inline edit on existing rows) ───────────────────────────────
  const [editingNameId, setEditingNameId] = useState(null)
  const [editNameInput, setEditNameInput] = useState('')
  const [editNameError, setEditNameError] = useState('')

  function startEditName(product) {
    setEditingNameId(product.id)
    setEditNameInput(product.name || '')
    setEditNameError('')
  }

  async function saveName(product) {
    setEditNameError('')
    const value = editNameInput.trim()
    if (!value) { setEditNameError('Name cannot be empty.'); return }
    const { error: updateErr } = await supabase
      .from('products')
      .update({ name: value })
      .eq('id', product.id)
    if (updateErr) { setEditNameError(updateErr.message); return }
    setEditingNameId(null)
    onChange()
  }

  // ── Price (inline edit on existing rows) ───────────────────────────────
  const [editingPriceId, setEditingPriceId] = useState(null)
  const [editPriceInput, setEditPriceInput] = useState('')
  const [editPriceError, setEditPriceError] = useState('')

  function startEditPrice(product) {
    setEditingPriceId(product.id)
    setEditPriceInput(String(product.price))
    setEditPriceError('')
  }

  async function savePrice(product) {
    setEditPriceError('')
    const value = Number(editPriceInput)
    if (!Number.isFinite(value) || value < 0) { setEditPriceError('Enter a valid price.'); return }
    const { error: updateErr } = await supabase
      .from('products')
      .update({ price: value })
      .eq('id', product.id)
    if (updateErr) { setEditPriceError(updateErr.message); return }
    setEditingPriceId(null)
    onChange()
  }

  // ── Stock (inline edit on existing rows) ───────────────────────────────
  const [editingStockId, setEditingStockId] = useState(null)
  const [editStockInput, setEditStockInput] = useState('')
  const [editStockError, setEditStockError] = useState('')

  function startEditStock(product) {
    setEditingStockId(product.id)
    setEditStockInput(String(product.stock))
    setEditStockError('')
  }

  async function saveStock(product) {
    setEditStockError('')
    const value = Number(editStockInput)
    if (!Number.isInteger(value) || value < 0) { setEditStockError('Enter a whole number.'); return }
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock: value })
      .eq('id', product.id)
    if (updateErr) { setEditStockError(updateErr.message); return }
    setEditingStockId(null)
    onChange()
  }

  // ── Add product ─────────────────────────────────────────────────────────
  async function addProduct(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    const price = Number(form.price)
    const stock = Number(form.stock || 0)
    if (!Number.isFinite(price) || price < 0) { setError('Enter a valid price.'); return }
    if (!Number.isInteger(stock) || stock < 0) { setError('Enter a valid starting stock count.'); return }

    setSaving(true)
    setError('')
    const { error: insertErr } = await supabase.from('products').insert({
      name: form.name.trim(),
      price,
      stock,
      active: true,
    })
    setSaving(false)
    if (insertErr) { setError(insertErr.message); return }
    setForm({ name: '', price: '', stock: '' })
    onChange()
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} style={{ display: 'none' }} />

      <form onSubmit={addProduct} style={{
        display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap',
        padding: 16, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 20,
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Product name</label>
          <input
            value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Gatorade"
            style={{ padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #d1d5db', width: 200 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Price</label>
          <input
            value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
            placeholder="2.50" inputMode="decimal"
            style={{ padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #d1d5db', width: 100 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Starting stock</label>
          <input
            value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })}
            placeholder="24" inputMode="numeric"
            style={{ padding: '9px 12px', fontSize: 14, borderRadius: 8, border: '1px solid #d1d5db', width: 100 }}
          />
        </div>
        <button type="submit" disabled={saving} style={{
          padding: '10px 18px', fontSize: 14, fontWeight: 700, borderRadius: 8, border: 'none',
          background: GREEN, color: 'white', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Adding…' : 'Add product'}
        </button>
        {error && <div style={{ color: '#dc2626', fontSize: 13, width: '100%' }}>{error}</div>}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {(products || []).map(product => (
          <div key={product.id} style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14,
          }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              {photoUrls[product.id] ? (
                <img
                  src={photoUrls[product.id]} alt={product.name}
                  onClick={() => triggerUpload(product)}
                  style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', display: 'block' }}
                  title="Click to replace photo"
                />
              ) : (
                <button
                  onClick={() => triggerUpload(product)}
                  disabled={uploadingId === product.id}
                  style={{
                    width: '100%', height: 120, borderRadius: 8, border: '1px dashed #d1d5db', background: '#f9fafb',
                    color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {uploadingId === product.id ? 'Uploading…' : '+ Add photo'}
                </button>
              )}
              {photoUrls[product.id] && (
                <button
                  onClick={() => removePhoto(product)}
                  title="Remove photo"
                  style={{
                    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, border: 'none',
                    background: 'rgba(17,24,39,0.7)', color: 'white', fontSize: 12, lineHeight: '22px', padding: 0, cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            {uploadError && pendingUploadProduct?.id === product.id && (
              <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{uploadError}</div>
            )}

            {editingNameId === product.id ? (
              <div style={{ marginBottom: 8 }}>
                <input
                  autoFocus value={editNameInput} onChange={e => setEditNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName(product)}
                  style={{ padding: '6px 8px', fontSize: 14, borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => saveName(product)} style={smallBtnStyle(GREEN)}>Save</button>
                  <button onClick={() => setEditingNameId(null)} style={smallBtnStyle('#6b7280')}>Cancel</button>
                </div>
                {editNameError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{editNameError}</div>}
              </div>
            ) : (
              <div
                onClick={() => startEditName(product)}
                style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8, cursor: 'pointer' }}
                title="Click to edit"
              >
                {product.name}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
              <span>Price</span>
              {editingPriceId === product.id ? (
                <span>
                  <input
                    autoFocus value={editPriceInput} onChange={e => setEditPriceInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && savePrice(product)}
                    inputMode="decimal"
                    style={{ padding: '4px 6px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', width: 70 }}
                  />
                  {' '}
                  <button onClick={() => savePrice(product)} style={smallBtnStyle(GREEN)}>✓</button>
                </span>
              ) : (
                <span onClick={() => startEditPrice(product)} style={{ cursor: 'pointer', fontWeight: 600, color: '#111827' }} title="Click to edit">
                  ${Number(product.price).toFixed(2)}
                </span>
              )}
            </div>
            {editPriceError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 4 }}>{editPriceError}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280' }}>
              <span>Stock</span>
              {editingStockId === product.id ? (
                <span>
                  <input
                    autoFocus value={editStockInput} onChange={e => setEditStockInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveStock(product)}
                    inputMode="numeric"
                    style={{ padding: '4px 6px', fontSize: 13, borderRadius: 6, border: '1px solid #d1d5db', width: 60 }}
                  />
                  {' '}
                  <button onClick={() => saveStock(product)} style={smallBtnStyle(GREEN)}>✓</button>
                </span>
              ) : (
                <span onClick={() => startEditStock(product)} style={{ cursor: 'pointer', fontWeight: 600, color: '#111827' }} title="Click to edit">
                  {product.stock}
                </span>
              )}
            </div>
            {editStockError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{editStockError}</div>}
          </div>
        ))}
        {(!products || products.length === 0) && (
          <div style={{ color: '#9ca3af', fontSize: 14 }}>No products yet — add one above.</div>
        )}
      </div>
    </div>
  )
}

function smallBtnStyle(bg) {
  return {
    padding: '4px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
    background: bg, color: 'white', cursor: 'pointer',
  }
}
