'use client'
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Full-screen camera scanner for the QR-badge fallback punch path. Uses the
// iPad's built-in camera â no extra hardware. Scans frames with jsQR until
// it finds a code, then hands the decoded text (an employee id) to onScan.
export default function QrScanner({ onScan, onCancel }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) {
          stop()
          onScan(code.data)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        tick()
      } catch (err) {
        setError('Could not access the camera. Check Safari camera permissions for this page.')
      }
    }

    start()
    return () => { cancelled = true; stop() }
  }, [onScan])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,31,22,0.97)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      color: 'white', padding: 24, boxSizing: 'border-box', textAlign: 'center',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>Scan your QR badge</div>
      <video ref={videoRef} muted playsInline
        style={{ width: 320, height: 240, borderRadius: 14, background: '#000', objectFit: 'cover' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {error && <div style={{ color: '#f87171', fontSize: 14, maxWidth: 300 }}>{error}</div>}
      <button onClick={onCancel} style={{
        padding: '10px 22px', borderRadius: 10, border: '1px solid #274a37', background: '#122a1f',
        color: '#8fae9c', fontSize: 14, cursor: 'pointer',
      }}>Cancel</button>
    </div>
  )
}
