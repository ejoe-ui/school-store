'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '../../../lib/supabase'

const GREEN = '#006938'

function startOfWeek() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function fmtWhen(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function Sales({ employees, currentManagerId }) {
  const [from, setFrom] = useState(startOfWeek())
  const [to, setTo] = useState(todayStr())
  const [sales, setSales] = useState([])
  const [itemsBySale, setItemsBySale] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [voidingId, setVoidingId] = useState(null)

  const nameById = Object.fromEntries((employees || []).map(e => [e.id, e.name]))

  const load = useCallback(async () => {
    setLoading(true)
    const dayStart = new Date(`${from}T00:00:00`).toISOString()
    const dayEnd   = new Date(`${to}T23:59:59.999`).toISOString()

    const { data } = await supabase
      .from('store_sales')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at', { ascending: false })

    setSales(data || [])
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  async function loadItems(saleId) {
    if (itemsBySale[saleId]) return itemsBySale[saleId]
    const { data } = await supabase
      .from('store_sale_items')
      .select('*')
      .eq('sale_id', saleId)
      .order('product_name')
    const items = data || []
    setItemsBySale(prev => ({ ...prev, [saleId]: items }))
    return items
  }

  async function toggleExpand(sale) {
    if (expanded === sale.id) {
      setExpanded(null)
      return
    }
    setExpanded(sale.id)
    await loadItems(sale.id)
  }

  // Void a sale: puts every line item's quantity back into product stock,
  // then marks the sale voided (kept for the record, excluded from totals)
  // rather than deleted, so there's a trail of who voided it and when.
  async function voidSale(sale) {
    if (sale.voided || voidingId) return
    const cashierName = nameById[sale.employee_id] || 'Unknown'
    if (!confirm(`Void this $${Number(sale.total).toFixed(2)} sale rung up by ${cashierName}? This puts the items back in stock.`)) return

    setVoidingId(sale.id)
    const items = await loadItems(sale.id)

    await Promise.all(items.map(async (item) => {
      const { data: product } = await supabase
        .from('products').select('stock').eq('id', item.product_id).single()
      if (product) {
        await supabase.from('products')
          .update({ stock: product.stock + item.quantity })
          .eq('id', item.product_id)
      }
    }))

    await supabase.from('store_sales').update({
      voided: true,
      voided_at: new Date().toISOString(),
      voided_by: currentManagerId || null,
    }).eq('id', sale.id)

    setVoidingId(null)
    load()
  }

  const validSales = sales.filter(s => !s.voided)
  const voidedCount = sales.length - validSales.length
  const totalRevenue = validSales.reduce((sum, s) => sum + Number(s.total), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'end', marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          From
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
        <label style={{ fontSize: 12, color: '#6b7280' }}>
          To
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #d1d5db' }} />
        </label>
      </div>

      <div style={{
        background: GREEN, borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        display: 'flex', gap: 32, alignItems: 'center',
      }}>
        <div>
          <div style={{ color: '#bfe3cf', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Revenue</div>
          <div style={{ color: 'white', fontSize: 26, fontWeight: 900 }}>${totalRevenue.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ color: '#bfe3cf', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sales</div>
          <div style={{ color: 'white', fontSize: 26, fontWeight: 900 }}>{validSales.length}</div>
        </div>
        {voidedCount > 0 && (
          <div style={{ color: '#bfe3cf', fontSize: 12 }}>{voidedCount} voided (excluded above)</div>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>When</th>
              <th style={{ padding: '10px 14px' }}>Cashier</th>
              <th style={{ padding: '10px 14px' }}>Total</th>
              <th style={{ padding: '10px 14px' }}></th>
              <th style={{ padding: '10px 14px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>}
            {!loading && sales.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>No sales in this range.</td></tr>
            )}
            {sales.map(sale => (
              <Fragment key={sale.id}>
                <tr style={{ borderTop: '1px solid #f0f0f0', opacity: sale.voided ? 0.5 : 1 }}>
                  <td style={{ padding: '10px 14px', cursor: 'pointer' }} onClick={() => toggleExpand(sale)}>{fmtWhen(sale.created_at)}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleExpand(sale)}>{nameById[sale.employee_id] || 'Unknown'}</td>
                  <td style={{
                    padding: '10px 14px', fontWeight: 700, color: sale.voided ? '#9ca3af' : GREEN,
                    textDecoration: sale.voided ? 'line-through' : 'none', cursor: 'pointer',
                  }} onClick={() => toggleExpand(sale)}>
                    ${Number(sale.total).toFixed(2)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12, cursor: 'pointer' }} onClick={() => toggleExpand(sale)}>
                    {sale.voided
                      ? `Voided ${fmtWhen(sale.voided_at)}`
                      : (expanded === sale.id ? '▲ hide items' : '▼ view items')}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {!sale.voided && (
                      <button
                        onClick={() => voidSale(sale)}
                        disabled={voidingId === sale.id}
                        style={{
                          border: '1px solid #fca5a5', background: 'white', color: '#dc2626',
                          borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                          cursor: voidingId === sale.id ? 'default' : 'pointer',
                          opacity: voidingId === sale.id ? 0.6 : 1,
                        }}
                      >
                        {voidingId === sale.id ? 'Voiding…' : 'Void'}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === sale.id && (
                  <tr style={{ background: '#f9fafb' }}>
                    <td colSpan={5} style={{ padding: '4px 14px 14px' }}>
                      {!itemsBySale[sale.id] && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading items…</div>}
                      {itemsBySale[sale.id] && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <tbody>
                            {itemsBySale[sale.id].map(item => (
                              <tr key={item.id}>
                                <td style={{ padding: '4px 0', color: '#374151' }}>{item.product_name}</td>
                                <td style={{ padding: '4px 0', color: '#6b7280', textAlign: 'right', width: 80 }}>× {item.quantity}</td>
                                <td style={{ padding: '4px 0', color: '#111827', textAlign: 'right', width: 80, fontWeight: 600 }}>
                                  ${Number(item.line_total).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
