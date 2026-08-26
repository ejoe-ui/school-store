'use client'
import { useEffect, useState } from 'react'

const GREEN = '#006938'

// Full-screen numeric keypad used by the kiosk to verify or set an
// employee's PIN before a punch is recorded. Purely presentational —
// buffers digits itself and calls onComplete once `length` digits are in.
export default function PinPad({ length = 4, title, subtitle, error, busy, onComplete, onCancel }) {
  const [digits, setDigits] = useState('')

  // Clear the dots whenever a new error comes in (wrong PIN / mismatch),
  // so the pad is ready for another attempt without a stale display.
  useEffect(() => { setDigits('') }, [error])

  function press(d) {
    if (busy) return
    setDigits(prev => {
      const next = (prev + d).slice(0, length)
      if (next.length === length) {
        setTimeout(() => onComplete(next), 120)
      }
      return next
    })
  }

  function backspace() {
    if (busy) return
    setDigits(prev => prev.slice(0, -1))
  }

  // Let the physical keyboard drive the pad too — 0-9 to type a digit,
  // Backspace/Delete to erase, Escape to cancel. Keeps everything routed
  // through the same press()/backspace() logic the on-screen buttons use.
  useEffect(() => {
    function onKeyDown(e) {
      if (busy) return
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        press(e.key)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        backspace()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onCancel && onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,31,22,0.97)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
      color: 'white', padding: 24, boxSizing: 'border-box', textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 14, color: '#8fae9c', maxWidth: 320, marginTop: -10 }}>{subtitle}</div>}

      <div style={{ display: 'flex', gap: 14, margin: '4px 0' }}>
        {Array.from({ length }).map((_, i) => (
          <div key={i} style={{
            width: 20, height: 20, borderRadius: '50%',
            border: `2px solid ${GREEN}`,
            background: i < digits.length ? GREEN : 'transparent',
            transition: 'background 0.1s',
          }} />
        ))}
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 14, fontWeight: 600, marginTop: -6 }}>{error}</div>}
      {busy && <div style={{ color: '#8fae9c', fontSize: 13, marginTop: -6 }}>Working…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: 12 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <button key={d} onClick={() => press(d)} disabled={busy} style={keyStyle}>{d}</button>
        ))}
        <button onClick={onCancel} disabled={busy} style={{ ...keyStyle, fontSize: 13, color: '#8fae9c' }}>Cancel</button>
        <button onClick={() => press('0')} disabled={busy} style={keyStyle}>0</button>
        <button onClick={backspace} disabled={busy} style={keyStyle}>⌫</button>
      </div>

      <div style={{ fontSize: 12, color: '#4d6d5b', marginTop: 2 }}>You can also type on your keyboard</div>
    </div>
  )
}

const keyStyle = {
  width: 76, height: 60, borderRadius: 14, border: '1px solid #274a37', background: '#122a1f',
  color: 'white', fontSize: 22, fontWeight: 700, cursor: 'pointer',
}
