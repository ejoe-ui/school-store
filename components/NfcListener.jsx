'use client'
import { useEffect, useRef, useCallback } from 'react'

// USB NFC reader acts as a keyboard: rapid keystrokes of the card's raw ID,
// then Enter. We buffer keystrokes and flush on Enter (or after a gap),
// same pattern as checkmate/src/components/NfcListener.jsx.
const MAX_CHAR_GAP_MS = 80

export default function NfcListener({ onScan, disabled = false }) {
  const inputRef   = useRef(null)
  const bufferRef  = useRef('')
  const lastKeyRef = useRef(0)

  const flush = useCallback(() => {
    const uid = bufferRef.current.trim()
    bufferRef.current = ''
    if (uid.length >= 4) onScan(uid)
  }, [onScan])

  useEffect(() => {
    if (disabled) return

    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Enter') { flush(); return }

      const now = Date.now()
      if (now - lastKeyRef.current > MAX_CHAR_GAP_MS) {
        bufferRef.current = ''
      }
      lastKeyRef.current = now
      bufferRef.current += e.key
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [disabled, flush])

  return null
}
