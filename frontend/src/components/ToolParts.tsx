import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export function TextDownload({ text, filename, children }: { text: string; filename: string; children: React.ReactNode }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [text])
  return <a className="button button-secondary button-small" href={url || undefined} download={filename}><Icon name="download" size={16} />{children}</a>
}

export function ToolStatus({ busy, error }: { busy: boolean; error: string }) {
  return <>{busy ? <div className="transfer-status" role="status"><p>OpenSSL đang xử lý trên máy này…</p><progress aria-label="Đang xử lý" /></div> : null}{error ? <p className="inline-error" role="alert">{error}</p> : null}</>
}

export function FileField({ id, label, name, accept }: { id: string; label: string; name: string; accept?: string }) {
  return <div className="field-group"><label htmlFor={id}>{label}</label><input id={id} name={name} type="file" accept={accept} required /></div>
}
