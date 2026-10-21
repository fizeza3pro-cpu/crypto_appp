import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export default function DialogShell({ title, subtitle, onClose, busy = false, children, wide = false }: {
  title: string; subtitle?: string; onClose: () => void; busy?: boolean; children: ReactNode; wide?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement
    element.showModal()
    document.body.classList.add('dialog-open')
    return () => {
      element.close()
      document.body.classList.remove('dialog-open')
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return <dialog ref={dialog} className={`app-dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex="0"]',
      )).filter(item => !item.matches(':disabled') && item.getClientRects().length > 0 &&
        !(item instanceof HTMLInputElement && item.type === 'radio' && !item.checked))
      const first = items[0]
      const last = items.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }}
    onCancel={event => { event.preventDefault(); if (!busy) onClose() }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div className="dialog-surface">
      <header className="dialog-header">
        <div><h2 id={titleId}>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        <button type="button" className="icon-button" aria-label={`Đóng ${title.toLowerCase()}`} onClick={onClose} disabled={busy}><Icon name="close" /></button>
      </header>
      {children}
    </div>
  </dialog>
}
