import { useRef, useEffect } from 'react'
import { startMicCapture } from '../audio/MicCapture'
import type { MicCaptureHandle } from '../audio/MicCapture'

interface AudioWorkletHostProps {
  active: boolean
}

export function AudioWorkletHost({ active }: AudioWorkletHostProps): null {
  const handleRef = useRef<MicCaptureHandle | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    startMicCapture()
      .then((handle) => {
        if (cancelled) {
          handle.stop()
        } else {
          handleRef.current = handle
        }
      })
      .catch((err) => {
        console.error('[AudioWorkletHost] mic capture failed:', err)
      })

    return () => {
      cancelled = true
      handleRef.current?.stop()
      handleRef.current = null
    }
  }, [active])

  return null
}
