import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { downloadTool, postTool } from '../lib/tools'
import type { Verification } from '../lib/tools'
import { useToolTask } from '../hooks/useToolTask'
import { FileField, TextDownload, ToolStatus } from './ToolParts'

export default function SignaturesPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [mode, setMode] = useState<'sign' | 'verify'>('sign')
  const [verification, setVerification] = useState<Verification | null>(null)
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const { busy, error, setError, run } = useToolTask(onBusyChange)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])
  return <div className="tool-columns"><section className="work-panel"><div className="work-panel-heading"><span className="panel-icon"><Icon name="shield" /></span><div><h2>Chữ ký số cho tài liệu</h2><p>RSA-PSS · SHA-256 · chữ ký tách rời .sig.</p></div></div>
    <form ref={formRef} className="workspace-form" onChange={() => { setVerification(null); setResult(null); setError('') }} onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setVerification(null); setResult(null)
      void run(async signal => {
        try {
          if (mode === 'sign') { const output = await downloadTool('signatures/sign', data, signal, () => undefined); signal.throwIfAborted(); setResult({ url: URL.createObjectURL(output.blob), name: output.filename }) }
          else { const output = await postTool<Verification>('signatures/verify', data, signal); signal.throwIfAborted(); setVerification(output) }
        } finally { form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = '' }) }
      })
    }}>
      <fieldset disabled={busy} className="tool-fields">
        <div className="tool-segment">{(['sign', 'verify'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setResult(null); setVerification(null); setError(''); formRef.current?.reset() }}>{value === 'sign' ? 'Ký tệp' : 'Xác minh'}</button>)}</div>
        <FileField id="signature-document" name="file" label="Tài liệu cần ký hoặc kiểm tra" />
        {mode === 'sign' ? <><FileField key="private" id="sign-private" name="private_key" label="Khóa riêng RSA (.pem có mật khẩu)" accept=".pem" /><div className="field-group"><label htmlFor="sign-pass">Mật khẩu khóa riêng</label><input id="sign-pass" type="password" name="password" autoComplete="off" required /></div></> : <><FileField key="public" id="verify-public" name="public_key" label="Khóa công khai của người ký (.pem)" accept=".pem" /><FileField id="verify-signature" name="signature" label="Chữ ký tách rời (.sig)" accept=".sig" /></>}
        <button className="button button-primary workspace-submit" type="submit">{mode === 'sign' ? 'Tạo chữ ký' : 'Xác minh chữ ký'}</button>
      </fieldset>
      <ToolStatus busy={busy} error={error} />
      {result ? <div className="tool-result" role="status"><h3>Đã ký tài liệu</h3><p>Tài liệu gốc được giữ nguyên. Gửi chữ ký này kèm tài liệu.</p><a className="button button-secondary" href={result.url} download={result.name}><Icon name="download" size={16} />Tải {result.name}</a></div> : null}
      {verification ? <div className={`tool-result ${verification.valid ? '' : 'tool-invalid'}`} role="status"><Icon name={verification.valid ? 'shield' : 'info'} size={32} /><h3>{verification.valid ? 'Chữ ký hợp lệ với khóa này' : 'Chữ ký không hợp lệ'}</h3><p>{verification.valid ? 'Nội dung được kiểm tra khớp với nội dung đã ký.' : 'Tài liệu, chữ ký hoặc khóa công khai không khớp. Không thể kết luận riêng nguyên nhân nào.'}</p><code className="tool-code">{verification.fingerprint}</code><p>Đối chiếu fingerprint để xác nhận khóa thuộc về người ký. Không có dấu thời gian tin cậy.</p><TextDownload text={JSON.stringify({ ...verification, checked_at: new Date().toISOString() }, null, 2)} filename="signature-verification.json">Xuất báo cáo kiểm tra</TextDownload></div> : null}
    </form></section>
    <aside className="tool-explainer"><h2>Chứng minh tài liệu<br />không bị thay đổi.</h2><ol><li><strong>Người ký giữ khóa riêng.</strong><p>Ứng dụng tạo chữ ký từ nội dung bằng OpenSSL.</p></li><li><strong>Người nhận giữ khóa công khai.</strong><p>Chọn tài liệu, chữ ký .sig và khóa công khai để kiểm tra.</p></li><li><strong>Một byte thay đổi cũng được phát hiện.</strong><p>Thử sửa tài liệu rồi xác minh lại bằng chữ ký cũ.</p></li></ol><div className="tool-note">Ký số không giấu nội dung tệp. Muốn bảo mật nội dung, mã hóa tài liệu ở trang Mã hóa tệp. Đây là chữ ký mật mã tách rời, không phải chữ ký hiển thị bên trong PDF.</div></aside>
  </div>
}
