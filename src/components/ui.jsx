import { useEffect, useState } from 'react'

export function Modal({ title, children, onClose, actions, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 760 } : undefined}>
        <h2>{title}</h2>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  )
}

export function ExecLog({ result }) {
  if (!result) return null
  const lines = result.log || (result.preview || []).map((cmd) => ({ cmd, ok: true, dryRun: true }))
  if (!lines.length) return null
  return (
    <div className="log">
      {lines.map((l, i) => (
        <div key={i} className={`log-line ${l.ok ? '' : 'fail'}`}>
          <span className="cmd">
            {l.ok ? '$' : '✗'} {l.cmd}
          </span>
          {l.stdout ? <span className="out">{l.stdout}</span> : null}
          {l.stderr ? <span className="out">{l.stderr}</span> : null}
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])
  const node = toast ? <div className={`toast ${toast.type || ''}`}>{toast.message}</div> : null
  return [node, (message, type) => setToast({ message, type })]
}

export const Badge = ({ kind, children }) => <span className={`badge ${kind || ''}`}>{children}</span>

export function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  if (d < 31) return `${d}일 전`
  return `${Math.round(d / 30)}개월 전`
}
