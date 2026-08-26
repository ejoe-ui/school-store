'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { resolveEmployee } from '../../lib/nfc'
import PinPad from '../../components/PinPad'
import NfcListener from '../../components/NfcListener'

const GREEN = '#006938'
const DARK  = '#0b1f16'

function initials(name) {
  return (name || '')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Register() {
  const [cashier, setCashier] = useState(null)

  // ── Roster + who's currently clocked in ──────────────────────────────
  // Only employees with an open shift may ring up a sale — the Register is
  // meant to be used from the floor during a shift, not by anyone who
  // happens to know a PIN.
  const [employees, setEmployees] = useState([])
  const [openShifts, setOpenShifts] = useState({})   // employee_id -> shift row
  const [loading, setLoading] = useState(true)

  const loadEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('store_employees')
      .select('*')
      .eq('active', true).order('name')
    setEmployees(data || [])
  }, [])

  const loadOpenShifts = useCallback(async () => {
    const { data } = await supabase
      .from('store_shifts').select('*').is('clock_out_at', null)
    const map = {}
    ;(data || []).forEach(s => { map[s.employee_id] = s })
    setOpenShifts(map)
  }, [])

  const loadAll = useCallback(async () => {
    await Promise.all([loadEmployees(), loadOpenShifts()])
    setLoading(false)
  }, [loadEmployees, loadOpenShifts])

  useEffect(() => { loadAll() }, [loadAll])

  const clockedInEmployees = employees.filter(e => openShifts[e.id])

  // ── Cashier login (PIN or NFC — same gate pattern as the punch clock) ──
  const [pendingEmployee, setPendingEmployee] = useState(null)
  const [pinMode, setPinMode] = useState(null)   // 'verify' | 'set-first' | 'set-confirm'
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [firstPin, setFirstPin] = useState('')
  const [loginError, setLoginError] = useState('')

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
    if (!openShifts[employee.id]) {
      setLoginError(`${employee.name.split(' ')[0]} isn't clocked in — clock in at the kiosk first.`)
      return
    }
    setLoginError('')
    setPinError('')
    setAttempts(0)
    setFirstPin('')
    setPendingEmployee(employee)
    setPinMode(employee.pin ? 'verify' : 'set-first')
  }, [openShifts])

  const handlePinComplete = useCallback(async (digits) => {
    if (!pendingEmployee) return

    if (pinMode === 'verify') {
      if (digits === pendingEmployee.pin) {
        setCashier(pendingEmployee)
        closeLogin()
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
      setCashier({ ...pendingEmployee, pin: digits })
      loadEmployees()
      closeLogin()
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

  // ── Products ────────────────────────────────────────────────────────
  const [products, setProducts] = useState([])
  const [photoUrls, setPhotoUrls] = useState({})

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('active', true).order('name')
    setProducts(data || [])
  }, [])

  useEffect(() => { if (cashier) loadProducts() }, [cashier, loadProducts])

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

  // ── Cart ────────────────────────────────────────────────────────────
  const [cart, setCart] = useState({})   // productId -> qty

  function addToCart(product) {
    if (product.stock <= 0) return
    setCart(prev => {
      const current = prev[product.id] || 0
      if (current >= product.stock) return prev
      return { ...prev, [product.id]: current + 1 }
    })
  }

  function decrementQty(product) {
    setCart(prev => {
      const current = prev[product.id] || 0
      if (current <= 1) {
        const next = { ...prev }
        delete next[product.id]
        return next
      }
      return { ...prev, [product.id]: current - 1 }
    })
  }

  function removeFromCart(product) {
    setCart(prev => {
      const next = { ...prev }
      delete next[product.id]
      return next
    })
  }

  function endSession() {
    setCashier(null)
    setCart({})
    setCheckoutError('')
  }

  // ── Checkout — logs the total, items, quantity, cashier, and time.
  // No payment-method tracking, per how the register is meant to be used. ──
  const [checkingOut, setCheckingOut] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [saleFlash, setSaleFlash] = useState(null)   // { total }

  async function confirmSale() {
    if (cartItems.length === 0 || checkingOut) return
    setCheckingOut(true)
    setCheckoutError('')

    const { data: sale, error: saleErr } = await supabase
      .from('store_sales')
      .insert({ employee_id: cashier.id, total })
      .select()
      .single()

    if (saleErr) {
      setCheckoutError(saleErr.message)
      setCheckingOut(false)
      return
    }

    const lineItems = cartItems.map(({ product, qty, unitPrice }) => ({
      sale_id: sale.id,
      product_id: product.id,
      product_name: product.name,
      unit_price: unitPrice,
      quantity: qty,
      line_total: unitPrice * qty,
    }))

    const { error: lineErr } = await supabase.from('store_sale_items').insert(lineItems)
    if (lineErr) {
      setCheckoutError(lineErr.message)
      setCheckingOut(false)
      return
    }

    await Promise.all(cartItems.map(({ product, qty }) =>
      supabase.from('products').update({ stock: product.stock - qty }).eq('id', product.id)
    ))

    setSaleFlash({ total })
    setCart({})
    setCheckingOut(false)
    loadProducts()
    setTimeout(() => setSaleFlash(null), 2500)
  }

  // ── Derived cart totals — sale price applied when a product is on sale ──
  const productById = Object.fromEntries(products.map(p => [p.id, p]))
  const cartItems = Object.entries(cart)
    .map(([id, qty]) => {
      const product = productById[id]
      if (!product) return null
      const unitPrice = product.sale_active && product.sale_pct_off
        ? Number(product.price) * (1 - product.sale_pct_off / 100)
        : Number(product.price)
      return { product, qty, unitPrice }
    })
    .filter(Boolean)

  const total = cartItems.reduce((sum, { qty, unitPrice }) => sum + unitPrice * qty, 0)

  const pinTitle = pinMode === 'verify'
    ? `Enter your PIN — ${pendingEmployee?.name?.split(' ')[0] || ''}`
    : pinMode === 'set-confirm'
      ? 'Confirm your new PIN'
      : `Choose a PIN — ${pendingEmployee?.name?.split(' ')[0] || ''}`

  const pinSubtitle = pinMode === 'verify'
    ? 'Ask a manager to reset it if you forgot.'
    : pinMode === 'set-confirm'
      ? 'Enter the same 4 digits again to confirm.'
      : 'Pick 4 digits nobody else knows. You’ll use it every time you ring up a sale.'

  // ── Not logged in: cashier picks their tile or taps a card ────────────
  if (!cashier) {
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
          <div style={{ fontSize: 28, fontWeight: 800 }}>Register — Cashier Login</div>
          <div style={{ fontSize: 13, color: '#8fae9c', marginTop: 4 }}>
            Tap your card, or tap your name — you'll enter your PIN next. You need to be clocked in to ring up a sale.
          </div>
        </div>

        {loginError && (
          <div style={{ color: '#f87171', fontSize: 14, fontWeight: 600, marginBottom: 16, maxWidth: 480 }}>{loginError}</div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 14, overflowY: 'auto', paddingRight: 4,
        }}>
          {!loading && clockedInEmployees.length === 0 && (
            <div style={{ color: '#8fae9c' }}>Nobody's clocked in right now — clock in at the kiosk first.</div>
          )}
          {clockedInEmployees.map(emp => (
            <button
              key={emp.id}
              onClick={() => beginLogin(emp)}
              style={{
                background: '#122a1f', border: `1px solid ${GREEN}`,
                borderRadius: 14, padding: '16px 12px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                color: 'white', textAlign: 'center',
              }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: GREEN,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 15,
              }}>
                {initials(emp.name)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{emp.name}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7CFFB2' }}>
                Clocked in
              </div>
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

        <div style={{ textAlign: 'center', fontSize: 11, color: '#4d6d5b', marginTop: 16 }}>
          <a href="/" style={{ color: '#4d6d5b' }}>← Back to kiosk</a>
          {' · '}
          <a href="/manager" style={{ color: '#4d6d5b' }}>Manager</a>
        </div>
      </div>
    )
  }

  // ── Logged in: POS screen ──────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, sans-serif' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 24px', background: 'white', borderBottom: '1px solid #e5e7eb',
      }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.1em', color: '#6b7280', textTransform: 'uppercase' }}>RHS School Store</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: GREEN }}>Register</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>Cashier: {cashier.name}</div>
          <button onClick={endSession} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white',
            color: '#6b7280', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>End session</button>
          <a href="/" style={{ color: '#6b7280', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Kiosk</a>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, padding: 20, alignItems: 'flex-start' }}>
        {/* ── Product grid ── */}
        <div style={{ flex: 2, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
          {products.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>No products yet — add some in the manager dashboard.</div>
          )}
          {products.map(product => {
            const outOfStock = product.stock <= 0
            const salePrice = product.sale_active && product.sale_pct_off
              ? Number(product.price) * (1 - product.sale_pct_off / 100)
              : null
            return (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                disabled={outOfStock}
                style={{
                  background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 10,
                  cursor: outOfStock ? 'default' : 'pointer', textAlign: 'left', position: 'relative',
                  opacity: outOfStock ? 0.5 : 1,
                }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  {photoUrls[product.id] ? (
                    <img src={photoUrls[product.id]} alt={product.name}
                      style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: 90, borderRadius: 8, background: '#f3f4f6',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c1c9d2', fontSize: 12,
                    }}>No photo</div>
                  )}
                  {product.sale_active && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                      borderRadius: 999, background: '#fef3c7', color: '#92400e', letterSpacing: '0.02em',
                    }}>
                      {product.sale_label || `${product.sale_pct_off}% OFF`}
                    </span>
                  )}
                  {outOfStock && (
                    <span style={{
                      position: 'absolute', bottom: 6, right: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700,
                      borderRadius: 999, background: 'rgba(17,24,39,0.75)', color: 'white',
                    }}>
                      OUT OF STOCK
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{product.name}</div>
                <div style={{ fontSize: 13 }}>
                  {salePrice != null ? (
                    <>
                      <span style={{ color: '#9ca3af', textDecoration: 'line-through', marginRight: 6 }}>${Number(product.price).toFixed(2)}</span>
                      <span style={{ color: '#dc2626', fontWeight: 700 }}>${salePrice.toFixed(2)}</span>
                    </>
                  ) : (
                    <span style={{ color: '#111827', fontWeight: 700 }}>${Number(product.price).toFixed(2)}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Cart ── */}
        <div style={{
          flex: 1, minWidth: 300, background: 'white', border: '1px solid #e5e7eb', borderRadius: 12,
          padding: 16, position: 'sticky', top: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Cart</div>

          {cartItems.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>Tap a product to add it here.</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {cartItems.map(({ product, qty, unitPrice }) => (
              <div key={product.id} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#111827' }}>
                  <span>{product.name}</span>
                  <span>${(unitPrice * qty).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <button onClick={() => decrementQty(product)} style={stepperBtnStyle}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{qty}</span>
                  <button onClick={() => addToCart(product)} disabled={qty >= product.stock} style={{
                    ...stepperBtnStyle, opacity: qty >= product.stock ? 0.4 : 1,
                  }}>+</button>
                  <button onClick={() => removeFromCart(product)} style={{
                    marginLeft: 'auto', border: 'none', background: 'none', color: '#991b1b',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#111827' }}>
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            {checkoutError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{checkoutError}</div>}

            <button
              onClick={confirmSale}
              disabled={cartItems.length === 0 || checkingOut}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: cartItems.length === 0 ? '#e5e7eb' : GREEN,
                color: cartItems.length === 0 ? '#9ca3af' : 'white',
                fontSize: 14, fontWeight: 700,
                cursor: (cartItems.length === 0 || checkingOut) ? 'default' : 'pointer',
              }}>
              {checkingOut ? 'Processing…' : `Complete sale — $${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      {saleFlash && (
        <div
          onClick={() => setSaleFlash(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: `linear-gradient(135deg, ${GREEN}, #003d20)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
          }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 36, fontWeight: 900, color: 'white' }}>Sale complete!</div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.9)' }}>${saleFlash.total.toFixed(2)}</div>
        </div>
      )}
    </div>
  )
}

const stepperBtnStyle = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb',
  color: '#111827', fontSize: 15, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
}
