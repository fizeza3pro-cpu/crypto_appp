import { getJson } from './api'
import type { TransferProgress } from './api'

export interface KeyInfo { type: string; bits: number; fingerprint: string; public_pem: string }
export interface KeyPair extends KeyInfo { private_pem: string; protection: string }
export interface Verification { valid: boolean; fingerprint: string; algorithm: string; identity_verified: boolean; trusted_timestamp: boolean }

export async function postTool<T>(path: string, body: FormData, signal: AbortSignal): Promise<T> {
  const { csrf_token } = await getJson<{ csrf_token: string }>('session', signal)
  const response = await fetch(`/api/v1/${path}`, { method: 'POST', body, signal, credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf_token } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? 'Không thể thực hiện tác vụ.')
  return result as T
}

export async function downloadTool(path: string, body: FormData, signal: AbortSignal, progress: (value: TransferProgress) => void): Promise<{ blob: Blob; filename: string }> {
  const { csrf_token } = await getJson<{ csrf_token: string }>('session', signal)
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const cancel = () => xhr.abort()
    const clean = () => signal.removeEventListener('abort', cancel)
    xhr.open('POST', `/api/v1/${path}`)
    xhr.setRequestHeader('X-CSRF-Token', csrf_token)
    xhr.responseType = 'blob'; xhr.timeout = 180000
    xhr.upload.onprogress = event => progress({ phase: 'uploading', percent: event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null })
    xhr.upload.onload = () => progress({ phase: 'processing', percent: null })
    xhr.onprogress = event => progress({ phase: 'downloading', percent: event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null })
    xhr.onerror = () => { clean(); reject(new Error('Mất kết nối với backend cục bộ.')) }
    xhr.ontimeout = () => { clean(); reject(new Error('Quá thời gian xử lý. Hãy thử tệp nhỏ hơn.')) }
    xhr.onabort = () => { clean(); reject(new DOMException('Đã ngừng chờ.', 'AbortError')) }
    xhr.onload = async () => {
      clean()
      if (xhr.status < 200 || xhr.status >= 300) {
        let message = 'Không thể xử lý tệp.'
        try { message = JSON.parse(await (xhr.response as Blob).text()).error.message } catch { /* Proxy fallback. */ }
        reject(new Error(message)); return
      }
      let filename = 'result.bin'
      const encoded = xhr.getResponseHeader('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      if (encoded) { try { filename = decodeURIComponent(encoded) } catch { /* Safe fallback. */ } }
      resolve({ blob: xhr.response as Blob, filename })
    }
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) { clean(); reject(new DOMException('Đã ngừng chờ.', 'AbortError')); return }
    xhr.send(body)
  })
}

export function errorMessage(cause: unknown) {
  return cause instanceof DOMException && cause.name === 'AbortError'
    ? 'Đã ngừng chờ và bỏ qua các tệp còn lại. Backend có thể vẫn hoàn tất tác vụ đang chạy rồi dọn tệp tạm.'
    : cause instanceof Error ? cause.message : 'Không thể hoàn thành tác vụ.'
}
