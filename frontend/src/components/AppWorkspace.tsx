import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon'
import { formatBytes } from '../lib/api'
import type { Capabilities, TransferProgress } from '../lib/api'
import { downloadTool, errorMessage, postTool } from '../lib/tools'
import type { KeyInfo } from '../lib/tools'

type Operation = 'encrypt' | 'decrypt' | 'rekey'
type Row = { file: File; status: string; error?: string; url?: string; name?: string }

export default function AppWorkspace({ capabilities, onBusyChange }: { capabilities: Capabilities; onBusyChange: (busy: boolean) => void }) {
  const [mode, setMode] = useState<Operation>(() => new URLSearchParams(location.search).get('operation') === 'decrypt' ? 'decrypt' : 'encrypt')
  const [method, setMethod] = useState('password')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null)
  const [progress, setProgress] = useState<TransferProgress>({ phase: 'processing', percent: null })
  const formRef = useRef<HTMLFormElement>(null)
  const controller = useRef<AbortController | null>(null)
  const keyController = useRef<AbortController | null>(null)
  const urls = useRef<string[]>([])
  const maxSize = mode === 'encrypt' ? capabilities.max_file_bytes : capabilities.max_encrypted_file_bytes
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  useEffect(() => () => { controller.current?.abort(); keyController.current?.abort(); urls.current.forEach(URL.revokeObjectURL) }, [])
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])
  function clear() { urls.current.forEach(URL.revokeObjectURL); urls.current = []; setRows([]); setError('') }
  function chooseFiles(files: FileList | null) {
    clear()
    const selected = Array.from(files ?? [])
    const limit = mode === 'rekey' ? 1 : 20
    setRows(selected.slice(0, limit).map(file => ({ file, status: 'Sẵn sàng' })))
    if (selected.length > limit) setError(`Mỗi lần xử lý tối đa ${limit} tệp.`)
  }
  function switchMode(next: Operation) { clear(); setMode(next); setKeyInfo(null); formRef.current?.reset(); keyController.current?.abort() }
  async function inspectKey(file?: File) {
    keyController.current?.abort(); setKeyInfo(null); setError('')
    if (!file) return
    const task = new AbortController(); keyController.current = task
    const data = new FormData(); data.set('public_key', file)
    try { const info = await postTool<KeyInfo>('keys/inspect', data, task.signal); if (!task.signal.aborted) setKeyInfo(info) }
    catch (cause) { if (!task.signal.aborted) setError(errorMessage(cause)) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    const values = new FormData(event.currentTarget)
    const password = String(values.get('password') ?? '')
    if (!rows.length) { setError('Hãy chọn ít nhất một tệp.'); return }
    if (rows.some(row => row.file.size > maxSize)) { setError(`Tệp vượt giới hạn ${formatBytes(maxSize)}.`); return }
    if ((method === 'password' || mode !== 'encrypt') && (!password || new TextEncoder().encode(password).length > 1024)) { setError('Nhập mật khẩu dài từ 1 đến 1024 byte UTF-8.'); return }
    if ((mode === 'encrypt' && method === 'password') || mode === 'rekey') {
      const target = mode === 'rekey' ? String(values.get('new_password') ?? '') : password
      if (!target || new TextEncoder().encode(target).length > 1024 || target !== values.get('confirm_password')) { setError('Mật khẩu mới và xác nhận chưa khớp hoặc quá dài.'); return }
    }
    const key = values.get(method === 'recipient' && mode === 'encrypt' ? 'public_key' : 'private_key')
    if (method === 'recipient' && mode !== 'rekey' && (!(key instanceof File) || !key.size)) { setError('Hãy chọn khóa PEM phù hợp.'); return }
    if (method === 'recipient' && mode === 'encrypt' && (!keyInfo || !values.get('confirmed_key'))) { setError('Hãy kiểm tra khóa công khai và xác nhận đã đối chiếu fingerprint.'); return }
    const task = new AbortController(); controller.current = task
    setBusy(true)
    const pending = rows.map(row => ({ file: row.file, status: 'Đang chờ' } as Row))
    urls.current.forEach(URL.revokeObjectURL); urls.current = []; setRows(pending)
    try {
      for (let i = 0; i < pending.length; i++) {
        task.signal.throwIfAborted()
        pending[i] = { ...pending[i], status: 'Đang xử lý' }; setRows([...pending])
        const data = new FormData(); data.set('file', pending[i].file)
        let path = `crypto/${mode}`
        if (method === 'recipient' && mode !== 'rekey') {
          path = `crypto/hybrid/${mode}`
          data.set(mode === 'encrypt' ? 'public_key' : 'private_key', key as File)
          if (mode === 'decrypt') data.set('password', password)
        } else {
          data.set('password', password)
          if (mode !== 'decrypt') { data.set('algorithm', String(values.get('algorithm'))); data.set('kdf', String(values.get('kdf'))) }
          if (mode === 'rekey') data.set('new_password', String(values.get('new_password')))
        }
        try {
          const output = await downloadTool(path, data, task.signal, setProgress)
          task.signal.throwIfAborted()
          const url = URL.createObjectURL(output.blob); urls.current.push(url)
          pending[i] = { ...pending[i], status: 'Hoàn tất', name: output.filename, url }
        } catch (cause) {
          if (task.signal.aborted) throw cause
          pending[i] = { ...pending[i], status: 'Thất bại', error: errorMessage(cause) }
        }
        setRows([...pending])
      }
    } catch (cause) {
      setError(errorMessage(cause))
      setRows(pending.map(row => row.status === 'Đang chờ' || row.status === 'Đang xử lý' ? { ...row, status: 'Đã ngừng' } : row))
    } finally {
      setBusy(false); controller.current = null
      formRef.current?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = '' })
    }
  }
  return <section className="work-panel" aria-label="Mã hóa và giải mã tệp">
    <div className="work-panel-heading"><span className="panel-icon"><Icon name="lock" size={21} /></span><div><h2>Bảo vệ tệp của bạn</h2><p>Mật khẩu cá nhân hoặc khóa của người nhận.</p></div></div>
    <form ref={formRef} className="workspace-form" onSubmit={submit}>
      <fieldset disabled={busy} className="tool-fields">
        <div className="tool-segment" aria-label="Thao tác">{(['encrypt', 'decrypt', 'rekey'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => switchMode(value)}>{value === 'encrypt' ? 'Mã hóa' : value === 'decrypt' ? 'Giải mã' : 'Đổi mật khẩu'}</button>)}</div>
        {mode !== 'rekey' ? <div className="field-group"><label htmlFor="protection-method">Phương thức bảo vệ</label><select id="protection-method" value={method} onChange={event => { setMethod(event.target.value); clear(); setKeyInfo(null); keyController.current?.abort() }}><option value="password">Bằng mật khẩu</option><option value="recipient">Bằng khóa người nhận (RSA-OAEP)</option></select></div> : <p className="tool-note">Dùng cho tệp bảo vệ bằng mật khẩu. Tạo bản mã mới; bản cũ được giữ nguyên.</p>}
        <div className="field-group"><label htmlFor="crypto-files">{mode === 'encrypt' ? 'Tệp cần bảo vệ' : 'Tệp .enc cần xử lý'}</label><label className="tool-file-picker" htmlFor="crypto-files" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) chooseFiles(event.dataTransfer.files) }}><Icon name="upload" size={28} /><strong>{rows.length ? `${rows.length} tệp đã chọn` : 'Chọn tệp từ máy tính'}</strong><span>Tối đa {formatBytes(maxSize)} / tệp · xử lý tuần tự</span><input id="crypto-files" type="file" multiple={mode !== 'rekey'} onChange={event => chooseFiles(event.target.files)} /></label></div>
        {method === 'recipient' && mode !== 'rekey' ? <>
          <div className="field-group"><label htmlFor="recipient-key">{mode === 'encrypt' ? 'Khóa công khai của người nhận (.pem)' : 'Khóa riêng của bạn (.pem có mật khẩu)'}</label><input key={`${mode}-${method}`} id="recipient-key" name={mode === 'encrypt' ? 'public_key' : 'private_key'} type="file" accept=".pem" required onChange={event => { if (mode === 'encrypt') void inspectKey(event.target.files?.[0]) }} /></div>
          {mode === 'encrypt' ? <><p className="tool-note">Tệp dùng AES-256-GCM; khóa tệp được bảo vệ bằng RSA-OAEP-SHA256. Tải bản mã về rồi gửi qua kênh bạn chọn.</p>{keyInfo ? <div className="key-fingerprint"><span>RSA {keyInfo.bits} · SHA-256 của khóa công khai</span><code>{keyInfo.fingerprint}</code><label className="tool-checkbox"><input name="confirmed_key" type="checkbox" required />Tôi đã đối chiếu fingerprint với người nhận qua kênh tin cậy.</label></div> : null}</> : null}
        </> : null}
        {method === 'password' || mode !== 'encrypt' ? <div className="field-group"><label htmlFor="crypto-password">{mode === 'rekey' ? 'Mật khẩu hiện tại' : method === 'recipient' ? 'Mật khẩu mở khóa riêng' : 'Mật khẩu tệp'}</label><input id="crypto-password" name="password" type="password" autoComplete="off" required /></div> : null}
        {mode === 'rekey' ? <div className="field-group"><label htmlFor="new-password">Mật khẩu mới</label><input id="new-password" name="new_password" type="password" autoComplete="new-password" required /></div> : null}
        {(method === 'password' && mode === 'encrypt') || mode === 'rekey' ? <div className="field-group"><label htmlFor="confirm-password">Xác nhận mật khẩu{mode === 'rekey' ? ' mới' : ''}</label><input id="confirm-password" name="confirm_password" type="password" autoComplete="new-password" required /></div> : null}
        {(method === 'password' && mode === 'encrypt') || mode === 'rekey' ? <details className="tool-advanced"><summary>Cấu hình nâng cao</summary><div className="field-group"><label htmlFor="algorithm">Thuật toán mã hóa</label><select id="algorithm" name="algorithm" defaultValue="aes-256-gcm">{capabilities.algorithms.map(item => <option key={item.id} value={item.id}>{item.name}{item.recommended ? ' · mặc định' : ''}</option>)}</select></div><div className="field-group"><label htmlFor="kdf">Dẫn xuất khóa</label><select id="kdf" name="kdf" defaultValue="pbkdf2">{(capabilities.kdfs ?? [{ id: 'pbkdf2', name: 'PBKDF2-HMAC-SHA256' }]).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><p className="field-hint">PBKDF2: 600.000 vòng. scrypt: N=32768, r=8, p=1, khoảng 32 MiB bộ nhớ làm việc.</p></div></details> : null}
        <button className="button button-primary workspace-submit" type="submit" disabled={busy}>{busy ? 'OpenSSL đang xử lý…' : mode === 'encrypt' ? 'Mã hóa tệp' : mode === 'decrypt' ? 'Giải mã tệp' : 'Tạo bản mã với mật khẩu mới'}</button>
      </fieldset>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      {busy ? <div className="transfer-status" role="status"><p>{progress.phase === 'uploading' ? 'Đang gửi tệp' : progress.phase === 'processing' ? 'Đang xử lý và xác thực' : 'Đang nhận kết quả'}{progress.percent !== null ? ` · ${progress.percent}%` : '…'}</p><progress max={100} value={progress.percent ?? undefined} /><button type="button" className="cancel-task" onClick={() => controller.current?.abort()}>Ngừng chờ và bỏ qua hàng đợi</button></div> : null}
      <ul className="tool-queue" aria-live="polite">{rows.map((row, index) => <li key={index}><Icon name={row.url ? 'check' : 'file'} size={20} /><div><strong>{row.file.name}</strong><span>{formatBytes(row.file.size)} · {row.status}</span>{row.error ? <p className="tool-row-error">{row.error}</p> : null}</div>{row.url ? <a className="button button-secondary button-small" href={row.url} download={row.name}>Tải tệp</a> : null}</li>)}</ul>
      <p className="workspace-privacy"><Icon name="shield" size={16} />Xử lý bằng C/OpenSSL trên backend cục bộ. Không có chức năng khôi phục mật khẩu hoặc khóa riêng bị mất.</p>
    </form>
  </section>
}
