import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from './Icon'
import { benchmarkFile, formatBytes } from '../lib/api'
import type { BenchmarkReport, Capabilities } from '../lib/api'

const number = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const ms = (value: number) => `${number.format(value)} ms`

export default function BenchmarkPanel({ capabilities, onBusyChange }: { capabilities: Capabilities; onBusyChange: (busy: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [runs, setRuns] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [report, setReport] = useState<(BenchmarkReport & { filename: string }) | null>(null)
  const [download, setDownload] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const fileButton = useRef<HTMLButtonElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  useEffect(() => {
    if (!report) { setDownload(''); return }
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    setDownload(url)
    return () => URL.revokeObjectURL(url)
  }, [report])
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError(''); setNotice('')
    if (!file || file.size === 0 || file.size > capabilities.benchmark_max_file_bytes) {
      setError(`Chọn tệp có dữ liệu, tối đa ${formatBytes(capabilities.benchmark_max_file_bytes)} để so sánh.`)
      fileButton.current?.focus(); return
    }
    const password = passwordInput.current?.value ?? ''
    if (!password || new TextEncoder().encode(password).length > 1024) {
      setError('Nhập mật khẩu đo thử dài từ 1 đến 1024 byte UTF-8.'); passwordInput.current?.focus(); return
    }
    const taskController = new AbortController()
    controller.current = taskController
    setBusy(true); setReport(null)
    try {
      const result = await benchmarkFile(file, password, runs, taskController.signal)
      taskController.signal.throwIfAborted()
      setReport({ ...result, filename: file.name })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setNotice('Đã ngừng chờ kết quả. Backend có thể vẫn hoàn tất phép đo đang chạy rồi dọn tệp tạm.')
      else setError(cause instanceof Error ? cause.message : 'Không thể thực hiện phép đo.')
    } finally {
      setBusy(false); controller.current = null
      if (passwordInput.current) passwordInput.current.value = ''
    }
  }

  const fastest = report ? Math.min(...report.results.map(item => item.median_ms)) : 0
  const slowest = report ? Math.max(...report.results.map(item => item.median_ms)) : 1
  return <div className="benchmark-layout">
    <section className="work-panel benchmark-config">
      <div className="work-panel-heading"><span className="panel-icon"><Icon name="gear" size={21} /></span><div><h2>Thiết lập phép đo</h2><p>Cùng tệp. Cùng mật khẩu. Cùng số lượt chạy.</p></div></div>
      <form className="workspace-form" onSubmit={submit} noValidate aria-busy={busy}>
        <div className="field-group"><span className="field-label">Tệp dùng để so sánh</span><div className="drop-zone">
          <input ref={fileInput} type="file" hidden aria-label="Chọn tệp đo hiệu năng" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setReport(null); setError(''); setNotice(''); event.target.value = '' }} />
          <span className="drop-icon"><Icon name={file ? 'file' : 'upload'} size={27} /></span><strong className="truncate">{file ? file.name : 'Bắt đầu với một tệp của bạn'}</strong><span className="text-muted text-sm">{file ? formatBytes(file.size) : `Tối đa ${formatBytes(capabilities.benchmark_max_file_bytes)} / tệp`}</span><button ref={fileButton} className="button button-secondary button-small" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{file ? 'Đổi tệp đo' : 'Chọn tệp đo'}</button>
        </div><p className="field-hint">Dùng một tệp duy nhất cho tất cả thuật toán. Bản mã thử nghiệm được xóa sau khi đo, không tải về.</p></div>
        <div className="field-group"><label htmlFor="benchmark-password">Mật khẩu đo thử</label><div className="password-wrap"><input ref={passwordInput} id="benchmark-password" type="password" name="password" autoComplete="off" disabled={busy} placeholder="Nhập mật khẩu cho phép đo…" aria-describedby="benchmark-password-hint" /></div><p className="field-hint" id="benchmark-password-hint">Dùng cùng mật khẩu cho mọi lượt chạy; ô nhập được xóa sau khi hoàn tất.</p></div>
        <div className="field-group"><label htmlFor="benchmark-runs">Số lượt / thuật toán</label><div className="select-wrap"><select id="benchmark-runs" value={runs} disabled={busy} onChange={event => setRuns(Number(event.target.value))}><option value={1}>1 lượt · kiểm tra nhanh</option><option value={2}>2 lượt · đối chiếu</option><option value={3}>3 lượt · khuyên dùng</option></select><Icon name="chevron" size={17} /></div></div>
        <div className="benchmark-algorithms"><span className="field-label">Thuật toán tham gia</span>{capabilities.algorithms.map(item => <p key={item.id}><Icon name="check" size={15} />{item.name}</p>)}</div>
        {error ? <div className="inline-error" role="alert"><Icon name="info" size={18} /><p>{error}</p></div> : null}
        <div className="transfer-status" role="status" aria-live="polite">{busy ? <><p>Đang gửi tệp và chạy {runs * capabilities.algorithms.length} phép mã hóa thực tế…</p><progress aria-label="Đang thực hiện đo hiệu năng" /><p className="field-hint">Có thể mất vài giây. Không chạy thêm tác vụ nặng để giảm nhiễu.</p></> : notice ? <p>{notice}</p> : null}</div>
        <button className="button button-primary workspace-submit" type="submit" disabled={busy}>{busy ? <><Icon name="spinner" className="spinner" size={18} />Đang đo hiệu năng…</> : <><Icon name="refresh" size={18} />Chạy so sánh</>}</button>
        {busy ? <button className="cancel-task" type="button" onClick={() => controller.current?.abort()}>Ngừng chờ kết quả</button> : null}
        <p className="workspace-privacy"><Icon name="shield" size={16} />Số liệu thật từ C / OpenSSL trên máy này.</p>
      </form>
    </section>
    <div className="benchmark-results" aria-busy={busy}>
      <div className="benchmark-result-heading"><div><p className="workspace-eyebrow">PERFORMANCE INSIGHTS</p><h2>Hiệu năng, nhìn từ dữ liệu.</h2></div>{report && download ? <a className="button button-secondary button-small" href={download} download="crypto-benchmark.json"><Icon name="download" size={16} />Xuất JSON</a> : null}</div>
      {!report ? <section className="benchmark-empty work-panel" aria-live="polite"><span className="benchmark-empty-icon"><Icon name={busy ? 'spinner' : 'gear'} className={busy ? 'spinner' : ''} size={37} /></span><h3>{busy ? 'OpenSSL đang thực hiện phép đo' : 'Không phỏng đoán. Hãy đo thử.'}</h3><p>{busy ? 'Kết quả sẽ xuất hiện khi tất cả thuật toán hoàn tất. Chúng tôi không hiển thị số liệu giả lập.' : 'Chọn một tệp và chạy so sánh để thấy thời gian mã hóa, tốc độ xử lý cùng chi phí dung lượng của từng thuật toán.'}</p><div className="empty-metrics"><span>Thời gian thực thi</span><span>Tốc độ xử lý</span><span>Dung lượng đầu ra</span></div></section> : <>
        <div className="benchmark-summary"><div><span>Tệp thử nghiệm</span><strong title={report.filename} className="truncate">{report.filename}</strong><small>{formatBytes(report.input_bytes)}</small></div><div><span>Lượt / thuật toán</span><strong>{report.runs.toLocaleString('vi-VN')}<small> lượt</small></strong><small>{report.results.length} thuật toán · chạy tuần tự</small></div><div><span>Trung vị thấp nhất</span><strong>{number.format(fastest)}<small> ms</small></strong><small>Trong lần so sánh này</small></div></div>
        <section className="work-panel comparison-chart"><div className="comparison-heading"><h3>Thời gian mã hóa</h3><span>Trung vị · thấp hơn là nhanh hơn</span></div>{report.results.map(item => <div className={`chart-row ${item.algorithm === 'aes-256-gcm' ? 'chart-gcm' : 'chart-cbc'}`} key={item.algorithm}><div><strong>{item.name}</strong><span>{ms(item.median_ms)}</span></div><meter min={0} max={slowest * 1.08} value={item.median_ms} aria-label={`${item.name}: ${ms(item.median_ms)}`} /></div>)}<p className="field-hint">Gồm khởi chạy tiến trình, PBKDF2, mã hóa, xác thực và đọc/ghi tệp. Không tính tải tệp qua HTTP. Đây không phải benchmark AES thuần.</p></section>
        <section className="work-panel comparison-details"><div className="comparison-heading"><h3>Đối chiếu chi tiết</h3><span>Đo trên cùng {formatBytes(report.input_bytes)}</span></div><div className="comparison-table-scroll" role="region" aria-label="Bảng kết quả và thông số thuật toán" tabIndex={0}><table className="comparison-table"><caption className="sr-only">Thời gian và thông số của các thuật toán trong lần đo mới nhất</caption><thead><tr><th scope="col">Thông số</th>{report.results.map(item => <th scope="col" key={item.algorithm}>{item.name}</th>)}</tr></thead><tbody>
          {([
            ['Trung vị', (i) => ms(i.median_ms)], ['Trung bình', (i) => ms(i.mean_ms)],
            ['Nhanh nhất / chậm nhất', (i) => `${ms(i.min_ms)} / ${ms(i.max_ms)}`], ['Độ lệch chuẩn (quần thể)', (i) => ms(i.stddev_ms)],
            ['Tốc độ toàn tác vụ', (i) => `${number.format(i.throughput_mib_s)} MiB/s`], ['Kích thước đầu ra', (i) => `${i.output_bytes.toLocaleString('vi-VN')} B`],
            ['Dung lượng tăng thêm', (i) => `+${i.overhead_bytes.toLocaleString('vi-VN')} B`], ['Khóa mã hóa', (i) => `${i.key_bits} bit`],
            ['Salt ngẫu nhiên', (i) => `${i.salt_bytes} byte`], ['IV / nonce', (i) => `${i.iv_bytes} byte`],
            ['Thẻ xác thực', (i) => `${i.tag_bytes} byte`], ['Cơ chế xác thực', (i) => i.authentication],
          ] satisfies [string, (i: BenchmarkReport['results'][number]) => string][]).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{report.results.map(item => <td key={item.algorithm}>{value(item)}</td>)}</tr>)}
          <tr><th scope="row">Từng lượt đo</th>{report.results.map(item => <td key={item.algorithm}>{item.samples_ms.map(value => ms(value)).join(' · ')}</td>)}</tr>
        </tbody></table></div><p className="table-mobile-hint">Vuốt ngang bảng để xem đầy đủ tất cả thuật toán →</p></section>
      </>}
      <section className="measurement-note"><Icon name="info" size={21} /><div><h3>Đọc kết quả đúng cách</h3><p>PBKDF2-HMAC-SHA256 · {(report?.pbkdf2_iterations ?? capabilities.pbkdf2_iterations).toLocaleString('vi-VN')} vòng. Salt và IV mới ở mỗi lượt. Mọi lượt đều được tính, không bỏ lượt làm nóng; thứ tự thuật toán được đảo sau mỗi vòng.</p><p>Tốc độ = dung lượng tệp gốc / thời gian trung vị toàn tác vụ. Kết quả phụ thuộc CPU, ổ đĩa, bộ nhớ đệm và tải máy; tệp nhỏ thường bị chi phối bởi PBKDF2. Nhanh hơn không có nghĩa là an toàn hơn.</p></div></section>
    </div>
  </div>
}
