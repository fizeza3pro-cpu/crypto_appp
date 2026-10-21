export interface Plan { id: string; name: string; price: number; featured: boolean; features: string[] }
export interface Capabilities {
  algorithms: { id: string; name: string; recommended: boolean }[]
  max_file_bytes: number
  max_encrypted_file_bytes: number
  benchmark_max_file_bytes: number
  pbkdf2_iterations: number
  openssl?: string
  kdfs?: { id: string; name: string }[]
  features?: string[]
}
export const defaultCapabilities: Capabilities = {
  algorithms: [
    { id: 'aes-256-gcm', name: 'AES-256-GCM', recommended: true },
    { id: 'aes-256-cbc-hmac-sha256', name: 'AES-256-CBC + HMAC-SHA256', recommended: false },
    { id: 'aes-128-gcm', name: 'AES-128-GCM', recommended: false },
    { id: 'chacha20-poly1305', name: 'ChaCha20-Poly1305', recommended: false },
  ],
  max_file_bytes: 268435456,
  max_encrypted_file_bytes: 268436480,
  kdfs: [{ id: 'pbkdf2', name: 'PBKDF2-HMAC-SHA256' }, { id: 'scrypt', name: 'scrypt' }],
  benchmark_max_file_bytes: 67108864,
  pbkdf2_iterations: 600000,
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, { signal, credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) throw new Error('Chưa kết nối được dịch vụ. Hãy khởi động backend và thử lại.')
  return response.json() as Promise<T>
}

export interface TransferProgress { phase: 'uploading' | 'processing' | 'downloading'; percent: number | null }

export interface BenchmarkResult {
  algorithm: string; name: string; samples_ms: number[]; median_ms: number; mean_ms: number
  min_ms: number; max_ms: number; stddev_ms: number; throughput_mib_s: number
  output_bytes: number; overhead_bytes: number; key_bits: number; salt_bytes: number
  iv_bytes: number; tag_bytes: number; authentication: string
}
export interface BenchmarkReport {
  input_bytes: number; runs: number; results: BenchmarkResult[]; kdf: string
  pbkdf2_iterations: number; file_format: string; header_bytes: number
  timing_scope: string; includes_kdf: boolean; includes_file_io: boolean
  includes_process_startup: boolean; includes_http_transfer: boolean
}

export async function benchmarkFile(file: File, password: string, runs: number, signal: AbortSignal): Promise<BenchmarkReport> {
  const { csrf_token } = await getJson<{ csrf_token: string }>('session', signal)
  const body = new FormData()
  body.append('file', file); body.append('password', password); body.append('runs', String(runs))
  const response = await fetch('/api/v1/crypto/benchmark', {
    method: 'POST', body, signal, credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf_token },
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? 'Không thể chạy phép đo. Hãy thử lại.')
  return result as BenchmarkReport
}

export async function transformFile(
  file: File, password: string, mode: 'encrypt' | 'decrypt', algorithm: string,
  signal: AbortSignal, onProgress: (progress: TransferProgress) => void,
): Promise<{ blob: Blob; filename: string }> {
  const { csrf_token } = await getJson<{ csrf_token: string }>('session', signal)
  signal.throwIfAborted()
  const body = new FormData()
  body.append('file', file)
  body.append('password', password)
  if (mode === 'encrypt') body.append('algorithm', algorithm)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const cancel = () => xhr.abort()
    const cleanup = () => signal.removeEventListener('abort', cancel)
    xhr.open('POST', `/api/v1/crypto/${mode}`)
    xhr.setRequestHeader('X-CSRF-Token', csrf_token)
    xhr.responseType = 'blob'
    xhr.timeout = 180000
    xhr.upload.onprogress = event => onProgress({ phase: 'uploading', percent: event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null })
    xhr.upload.onload = () => onProgress({ phase: 'processing', percent: null })
    xhr.onprogress = event => onProgress({ phase: 'downloading', percent: event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null })
    xhr.onerror = () => { cleanup(); reject(new Error('Mất kết nối. Hãy kiểm tra backend rồi thử lại.')) }
    xhr.ontimeout = () => { cleanup(); reject(new Error('Tác vụ mất quá nhiều thời gian. Hãy thử lại với tệp nhỏ hơn.')) }
    xhr.onabort = () => { cleanup(); reject(new DOMException('Đã hủy tác vụ.', 'AbortError')) }
    xhr.onload = async () => {
      cleanup()
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = 'Không thể xử lý tệp. Hãy kiểm tra mật khẩu và thử lại.'
        try { message = JSON.parse(await (xhr.response as Blob).text()).error.message } catch { /* Preserve a useful fallback for a proxy error. */ }
        reject(new Error(message))
        return
      }
      let filename = mode === 'encrypt' ? `${file.name}.enc` : `${file.name.replace(/\.enc$/i, '')}.decrypted`
      const encoded = xhr.getResponseHeader('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      if (encoded) { try { filename = decodeURIComponent(encoded) } catch { /* Keep safe fallback. */ } }
      resolve({ blob: xhr.response as Blob, filename })
    }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) { cleanup(); reject(new DOMException('Đã hủy tác vụ.', 'AbortError')); return }
    onProgress({ phase: 'uploading', percent: 0 })
    xhr.send(body)
  })
}

const sizes = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${sizes.format(bytes)} B`
  if (bytes < 1048576) return `${sizes.format(bytes / 1024)} KiB`
  return `${sizes.format(bytes / 1048576)} MiB`
}
