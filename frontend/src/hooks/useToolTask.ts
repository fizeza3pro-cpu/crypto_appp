import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/tools'

export function useToolTask(onBusyChange: (busy: boolean) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const task = useRef<AbortController | null>(null)
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false) }, [busy, onBusyChange])
  useEffect(() => () => task.current?.abort(), [])
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (task.current) return
    const controller = new AbortController(); task.current = controller
    setError(''); setBusy(true)
    try { await action(controller.signal) } catch (cause) { setError(errorMessage(cause)) }
    finally { task.current = null; setBusy(false) }
  }
  return { busy, error, setError, run }
}
