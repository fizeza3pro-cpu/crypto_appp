import { useState } from 'react'
import { Icon } from './Icon'
import { postTool } from '../lib/tools'
import type { KeyInfo, KeyPair } from '../lib/tools'
import { useToolTask } from '../hooks/useToolTask'
import { FileField, TextDownload, ToolStatus } from './ToolParts'

type Contact = KeyInfo & { name: string }
const storageKey = 'crypto-public-contacts-v1'
function loadContacts(): Contact[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(saved) ? saved.filter((item): item is Contact => typeof item?.name === 'string' && typeof item?.public_pem === 'string' && item.public_pem.length < 16385 && /^[a-f0-9]{64}$/.test(item.fingerprint)).slice(0, 30) : []
  } catch { return [] }
}

export default function KeysPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const { busy, error, setError, run } = useToolTask(onBusyChange)
  const [pair, setPair] = useState<KeyPair | null>(null)
  const [inspected, setInspected] = useState<KeyInfo | null>(null)
  const [contacts, setContacts] = useState(loadContacts)
  const [notice, setNotice] = useState('')
  function save(next: Contact[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setContacts(next); setNotice('Đã cập nhật danh bạ khóa công khai trên trình duyệt này.') }
    catch { setError('Trình duyệt không cho lưu danh bạ. Bạn vẫn có thể tải khóa PEM.') }
  }
  return <div className="tool-columns">
    <section className="work-panel"><div className="work-panel-heading"><span className="panel-icon"><Icon name="key" /></span><div><h2>Tạo cặp khóa RSA</h2><p>RSA 3072 bit · khóa riêng PKCS#8 có mật khẩu.</p></div></div>
      <form className="workspace-form" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
        if (data.get('password') !== data.get('confirmation')) { setError('Hai mật khẩu chưa khớp.'); return }
        data.delete('confirmation'); setPair(null)
        void run(async signal => {
          try { const result = await postTool<KeyPair>('keys/generate', data, signal); signal.throwIfAborted(); setPair(result) }
          finally { form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = '' }) }
        })
      }}>
        <fieldset disabled={busy} className="tool-fields">
          <div className="field-group"><label htmlFor="key-pass">Mật khẩu bảo vệ khóa riêng</label><input id="key-pass" name="password" type="password" minLength={12} required autoComplete="new-password" /><p className="field-hint">Ít nhất 12 ký tự. Mật khẩu này không gửi cho người nhận.</p></div>
          <div className="field-group"><label htmlFor="key-confirm">Xác nhận mật khẩu</label><input id="key-confirm" name="confirmation" type="password" minLength={12} required autoComplete="new-password" /></div>
          <button type="submit" className="button button-primary workspace-submit">{busy ? 'Đang tạo khóa…' : 'Tạo cặp khóa'}</button>
        </fieldset>
        <ToolStatus busy={busy} error={error} />
        {pair ? <div className="tool-result" role="status"><h3>Cặp khóa đã sẵn sàng</h3><p>Tải cả hai tệp trước khi rời trang. Khóa riêng chỉ giữ tạm trong bộ nhớ trang này.</p><div className="key-fingerprint"><span>Fingerprint SHA-256 · SPKI DER</span><code>{pair.fingerprint}</code></div><div className="tool-actions"><TextDownload text={pair.public_pem} filename="crypto-public.pem">Tải khóa công khai</TextDownload><TextDownload text={pair.private_pem} filename="crypto-private.pem">Tải khóa riêng có mật khẩu</TextDownload></div><p className="field-hint">{pair.protection}</p><button type="button" className="cancel-task" onClick={() => setPair(null)}>Bỏ kết quả khỏi trang</button></div> : null}
        <p className="tool-note">Dùng cặp khóa riêng cho việc nhận tệp và cặp khác cho ký số. Khóa công khai có thể chia sẻ; khóa riêng phải do bạn giữ.</p>
      </form>
    </section>
    <div className="tool-stack"><section className="work-panel"><div className="work-panel-heading"><span className="panel-icon"><Icon name="shield" /></span><div><h2>Kiểm tra & lưu khóa công khai</h2><p>Đối chiếu fingerprint qua kênh tin cậy trước khi dùng.</p></div></div><form className="workspace-form" onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); setInspected(null)
      void run(async signal => { const result = await postTool<KeyInfo>('keys/inspect', data, signal); signal.throwIfAborted(); setInspected(result) })
    }}><fieldset disabled={busy} className="tool-fields"><FileField id="inspect-public" name="public_key" label="Khóa công khai RSA (.pem)" accept=".pem" /><button className="button button-secondary" type="submit">Đọc thông tin khóa</button></fieldset></form>
      {inspected ? <form className="workspace-form tool-result" onSubmit={event => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name') ?? '').trim(); if (!name) return; if (contacts.length >= 30 && !contacts.some(c => c.fingerprint === inspected.fingerprint)) { setError('Danh bạ tối đa 30 khóa.'); return }; save([...contacts.filter(c => c.fingerprint !== inspected.fingerprint), { ...inspected, name }]) }}><strong>{inspected.type} {inspected.bits} bit</strong><code className="tool-code">{inspected.fingerprint}</code><div className="field-group"><label htmlFor="contact-name">Tên trong danh bạ</label><input id="contact-name" name="name" maxLength={80} required placeholder="Ví dụ: Bình — khóa nhận tài liệu" /></div><button className="button button-secondary" type="submit">Lưu khóa công khai</button></form> : null}
    </section>
    <section className="work-panel public-directory"><h2>Danh bạ khóa công khai</h2><p>Chỉ lưu khóa công khai trên trình duyệt này. Tên bạn đặt không phải bằng chứng danh tính.</p>{contacts.length ? <ul>{contacts.map(contact => <li key={contact.fingerprint}><strong>{contact.name}</strong><code>{contact.fingerprint}</code><div className="tool-actions"><TextDownload text={contact.public_pem} filename="recipient-public.pem">Xuất PEM</TextDownload><button type="button" className="cancel-task" onClick={() => save(contacts.filter(c => c.fingerprint !== contact.fingerprint))}>Xóa khỏi danh bạ</button></div></li>)}</ul> : <p className="field-hint">Chưa có khóa. Nhập tệp PEM ở trên để bắt đầu.</p>}<p role="status">{notice}</p></section>
    </div>
  </div>
}
