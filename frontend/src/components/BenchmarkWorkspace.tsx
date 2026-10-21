import { lazy, Suspense, useCallback, useState } from 'react'
import type { Capabilities } from '../lib/api'
import { postTool } from '../lib/tools'
import { useToolTask } from '../hooks/useToolTask'
import { FileField, TextDownload, ToolStatus } from './ToolParts'

const BenchmarkPanel = lazy(() => import('./BenchmarkPanel'))
type Metric = { algorithm: string; samples_ms?: number[]; median_ms?: number; stddev_ms?: number; encrypt_samples_ms?: number[]; decrypt_samples_ms?: number[]; encrypt_median_ms?: number; decrypt_median_ms?: number; encrypt_mib_s?: number; decrypt_mib_s?: number }
type Report = { mode: string; openssl: string; runs: number; warmup_runs: number; roundtrip_verified?: boolean; results: Metric[] }
const num = (value?: number) => value === undefined ? '—' : value.toLocaleString('vi-VN', { maximumFractionDigits: 4 })

function IsolatedBenchmark({ mode, onBusyChange }: { mode: 'core' | 'kdf'; onBusyChange: (busy: boolean) => void }) {
  const [report, setReport] = useState<Report | null>(null)
  const { busy, error, run } = useToolTask(onBusyChange)
  return <div className="tool-columns"><section className="work-panel"><div className="work-panel-heading"><div><h2>{mode === 'core' ? 'Đo mật mã trong bộ nhớ' : 'Đo dẫn xuất khóa'}</h2><p>1 lượt làm nóng, 3 lượt đo; thứ tự được đảo mỗi vòng.</p></div></div><form className="workspace-form" onSubmit={event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setReport(null)
    void run(async signal => {
      try { const result = await postTool<Report>(`crypto/benchmark/${mode}`, data, signal); signal.throwIfAborted(); setReport(result) }
      finally { form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input => { input.value = '' }) }
    })
  }}><fieldset className="tool-fields" disabled={busy}>{mode === 'core' ? <><FileField id="core-file" name="file" label="Tệp mẫu để đọc vào bộ nhớ" /><p className="field-hint">Tệp có dữ liệu, tối đa 16 MiB. Không tính thời gian đọc tệp, cấp phát bộ nhớ, RNG, KDF hoặc khởi chạy tiến trình.</p></> : <><div className="field-group"><label htmlFor="kdf-password">Mật khẩu đo thử</label><input id="kdf-password" name="password" type="password" autoComplete="off" required /></div><p className="field-hint">Cùng mật khẩu, salt 16 byte và đầu ra 64 byte. PBKDF2-SHA256: 600.000 vòng; scrypt: N=32768, r=8, p=1.</p></>}<button className="button button-primary" type="submit">Chạy phép đo {mode === 'core' ? 'mật mã' : 'KDF'}</button></fieldset><ToolStatus busy={busy} error={error} /></form></section>
    <section className="work-panel tool-report"><h2>Kết quả {mode === 'core' ? 'mã hóa & giải mã' : 'KDF'}</h2>{report ? <><p className="field-hint">{report.openssl} · {report.runs} lượt đo · {report.warmup_runs} lượt làm nóng</p><div className="comparison-table-scroll"><table className="comparison-table"><thead><tr><th scope="col">Thuật toán</th><th scope="col">{mode === 'core' ? 'Mã hóa' : 'Dẫn xuất'}</th>{mode === 'core' ? <th scope="col">Giải mã</th> : null}</tr></thead><tbody>{report.results.map(item => <tr key={item.algorithm}><th scope="row">{item.algorithm}</th><td>{num(mode === 'core' ? item.encrypt_median_ms : item.median_ms)} ms{mode === 'core' ? <><br />{num(item.encrypt_mib_s)} MiB/s</> : null}</td>{mode === 'core' ? <td>{num(item.decrypt_median_ms)} ms<br />{num(item.decrypt_mib_s)} MiB/s</td> : null}</tr>)}</tbody></table></div><p className="field-hint">{report.roundtrip_verified ? 'Mỗi lượt giải mã đều xác thực và đối chiếu nội dung với dữ liệu gốc.' : 'Đây là thời gian dẫn xuất khóa, không phải tốc độ mã hóa.'}</p><TextDownload text={JSON.stringify(report, null, 2)} filename={`benchmark-${mode}.json`}>Xuất mẫu đo và thống kê</TextDownload></> : <p className="field-hint">Kết quả xuất hiện sau khi hoàn tất phép đo thực. Giá trị trong bảng là trung vị của ba lượt.</p>}<p className="tool-note">{mode === 'core' ? 'Bao gồm khởi tạo cipher, mã hóa/giải mã, padding và tag/MAC. Đây là phép đo buffer trong RAM, không bao gồm đóng gói định dạng tệp.' : 'Giới hạn bộ nhớ scrypt là 64 MiB; đây không phải số RAM đỉnh đã đo của tiến trình.'} Kết quả phụ thuộc máy và tải nền. Không suy luận độ an toàn từ thứ hạng tốc độ.</p></section>
  </div>
}

export default function BenchmarkWorkspace({ capabilities, onBusyChange }: { capabilities: Capabilities; onBusyChange: (busy: boolean) => void }) {
  const [mode, setMode] = useState<'pipeline' | 'core' | 'kdf'>('pipeline')
  const [busy, setBusy] = useState(false)
  const updateBusy = useCallback((value: boolean) => { setBusy(value); onBusyChange(value) }, [onBusyChange])
  return <><div className="tool-segment benchmark-modes">{(['pipeline', 'core', 'kdf'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} disabled={busy} onClick={() => setMode(value)}>{value === 'pipeline' ? 'Toàn quy trình tệp' : value === 'core' ? 'Mật mã trong RAM' : 'Dẫn xuất khóa (KDF)'}</button>)}</div>{mode === 'pipeline' ? <Suspense fallback={<p role="status">Đang mở phép đo…</p>}><BenchmarkPanel capabilities={capabilities} onBusyChange={updateBusy} /></Suspense> : <IsolatedBenchmark key={mode} mode={mode} onBusyChange={updateBusy} />}</>
}
