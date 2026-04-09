'use client'
import { useRef, useState, useCallback } from 'react'

// Rhubarb viseme codes → jawOpen value (0–1)
const VISEME_TO_JAW: Record<string, number> = {
  X: 0.0, A: 0.2, B: 0.55, C: 0.4, D: 0.45, E: 0.5, F: 0.3, G: 0.35, H: 0.65,
}

interface MouthCue { start: number; end: number; value: string }

interface QueueItem {
  pcm: Int16Array
  mouthCuesPromise: Promise<MouthCue[]>
}

export function usePCMAudioPlayer() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const playbackQueueRef = useRef<QueueItem[]>([])
  const utteranceBufferRef = useRef<Int16Array[]>([])
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visemeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const rafRef = useRef<number | null>(null)
  const isPlayingInternalRef = useRef(false)
  const jawOpenRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)

  function getCtx(): AudioContext {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      const analyser = audioContextRef.current.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.6
      analyserRef.current = analyser
    }
    return audioContextRef.current
  }

  function bytesToInt16(bytes: Uint8Array): Int16Array {
    return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  }

  function startAmplitudeTracking() {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.fftSize)
    function tick() {
      analyser!.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const s = (data[i] - 128) / 128
        sum += s * s
      }
      jawOpenRef.current = Math.min(1, Math.sqrt(sum / data.length) * 4)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function stopAmplitudeTracking() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  function clearVisemeTimeouts() {
    for (const t of visemeTimeoutsRef.current) clearTimeout(t)
    visemeTimeoutsRef.current = []
  }

  async function fetchMouthCues(pcm: Int16Array): Promise<MouthCue[]> {
    try {
      const res = await fetch('/api/lipsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcm.buffer as ArrayBuffer,
      })
      if (!res.ok) return []
      const data = await res.json() as { mouthCues: MouthCue[] }
      return data.mouthCues
    } catch {
      return []
    }
  }

  async function playNext() {
    const item = playbackQueueRef.current.shift()
    if (!item) {
      isPlayingInternalRef.current = false
      stopAmplitudeTracking()
      jawOpenRef.current = 0
      setIsPlaying(false)
      return
    }

    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const { pcm, mouthCuesPromise } = item
    const float32 = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768

    const audioBuffer = ctx.createBuffer(1, pcm.length, 16000)
    audioBuffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(analyserRef.current!)
    analyserRef.current!.connect(ctx.destination)

    const playbackStart = ctx.currentTime
    source.start(playbackStart)
    currentSourceRef.current = source
    isPlayingInternalRef.current = true
    setIsPlaying(true)

    // Start with amplitude immediately — no waiting
    startAmplitudeTracking()

    // When rhubarb returns, seamlessly switch to phoneme visemes
    mouthCuesPromise.then(cues => {
      if (!cues.length || currentSourceRef.current !== source) return
      const elapsed = ctx.currentTime - playbackStart
      stopAmplitudeTracking()
      clearVisemeTimeouts()
      for (const cue of cues) {
        const delay = (cue.start - elapsed) * 1000
        if (delay < -100) continue  // already past
        const t = setTimeout(() => {
          jawOpenRef.current = VISEME_TO_JAW[cue.value] ?? 0
        }, Math.max(0, delay))
        visemeTimeoutsRef.current.push(t)
      }
    }).catch(() => {})  // keep amplitude on error

    source.onended = () => {
      if (currentSourceRef.current === source) currentSourceRef.current = null
      stopAmplitudeTracking()
      clearVisemeTimeouts()
      jawOpenRef.current = 0
      playNext()
    }
  }

  async function enqueueUtterance() {
    if (utteranceBufferRef.current.length === 0) return

    const totalSamples = utteranceBufferRef.current.reduce((s, c) => s + c.length, 0)
    const combined = new Int16Array(totalSamples)
    let offset = 0
    for (const chunk of utteranceBufferRef.current) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    utteranceBufferRef.current = []

    // Fire rhubarb immediately in parallel — will be ready by the time this utterance plays
    const mouthCuesPromise = fetchMouthCues(combined)

    playbackQueueRef.current.push({ pcm: combined, mouthCuesPromise })

    if (!isPlayingInternalRef.current) {
      playNext()
    }
  }

  const playPCMChunk = useCallback((bytes: Uint8Array) => {
    utteranceBufferRef.current.push(bytesToInt16(bytes))
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      enqueueUtterance()
    }, 200)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const clearAudioBuffer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    utteranceBufferRef.current = []
    playbackQueueRef.current = []
    clearVisemeTimeouts()
    if (currentSourceRef.current) {
      currentSourceRef.current.onended = null
      try { currentSourceRef.current.stop() } catch {}
      currentSourceRef.current = null
    }
    isPlayingInternalRef.current = false
    stopAmplitudeTracking()
    jawOpenRef.current = 0
    setIsPlaying(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dispose = useCallback(() => {
    clearAudioBuffer()
    audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
  }, [clearAudioBuffer])

  return { playPCMChunk, clearAudioBuffer, dispose, isPlaying, jawOpenRef }
}
