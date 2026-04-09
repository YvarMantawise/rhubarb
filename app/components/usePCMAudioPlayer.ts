'use client'
import { useRef, useState, useCallback } from 'react'

// Rhubarb viseme codes → ARKit morph target values (0–1)
// X = silence, A = P/B/M (bilabial closed), B = K/S/T/ch/sh, C = EH/AE (open spread),
// D = EE (wide smile), E = OH (rounded), F = F/V (teeth on lip),
// G = TH (tongue between teeth), H = L/N/R (open with tongue)
const VISEME_TO_MORPHS: Record<string, Record<string, number>> = {
  X: {},
  A: { jawOpen: 0.0, mouthClose: 0.8, mouthPress_L: 0.4, mouthPress_R: 0.4, mouthRollUpper: 0.3, mouthRollLower: 0.3 },
  B: { jawOpen: 0.3, mouthShrugUpper: 0.2, mouthUpperUp_L: 0.2, mouthUpperUp_R: 0.2 },
  C: { jawOpen: 0.5, mouthSmile_L: 0.2, mouthSmile_R: 0.2, mouthUpperUp_L: 0.3, mouthUpperUp_R: 0.3, mouthLowerDown_L: 0.3, mouthLowerDown_R: 0.3 },
  D: { jawOpen: 0.15, mouthSmile_L: 0.7, mouthSmile_R: 0.7, mouthDimple_L: 0.3, mouthDimple_R: 0.3, mouthUpperUp_L: 0.2, mouthUpperUp_R: 0.2, mouthStretch_L: 0.2, mouthStretch_R: 0.2 },
  E: { jawOpen: 0.4, mouthFunnel: 0.6, mouthPucker: 0.3, mouthRollUpper: 0.2, mouthRollLower: 0.2 },
  F: { jawOpen: 0.1, mouthShrugUpper: 0.5, mouthLowerDown_L: 0.4, mouthLowerDown_R: 0.4, mouthPress_L: 0.2, mouthPress_R: 0.2 },
  G: { jawOpen: 0.25, tongueOut: 0.7 },
  H: { jawOpen: 0.45, tongueOut: 0.2, mouthUpperUp_L: 0.1, mouthUpperUp_R: 0.1 },
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
  const morphTargetsRef = useRef<Record<string, number>>({})
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
      const amplitude = Math.min(1, Math.sqrt(sum / data.length) * 4)
      morphTargetsRef.current = { jawOpen: amplitude }
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
      morphTargetsRef.current = {}
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

    // When rhubarb returns, switch to phoneme visemes (even if audio just finished)
    mouthCuesPromise.then((cues: MouthCue[]) => {
      if (!cues.length) return
      // Only bail if a *different* utterance is actively playing
      if (currentSourceRef.current !== null && currentSourceRef.current !== source) return

      const elapsed = ctx.currentTime - playbackStart
      console.log(`[lipsync] ${cues.length} cues arrived, elapsed=${elapsed.toFixed(2)}s, audio=${(pcm.length/16000).toFixed(2)}s`)
      stopAmplitudeTracking()
      clearVisemeTimeouts()

      // Apply whichever cue should be active right now
      let activeCue: MouthCue | null = null
      for (const cue of cues) {
        if (cue.start <= elapsed + 0.05) activeCue = cue
      }
      if (activeCue) morphTargetsRef.current = VISEME_TO_MORPHS[activeCue.value] ?? {}

      // Schedule future cues
      let hasFutureCues = false
      for (const cue of cues) {
        const delay = (cue.start - elapsed) * 1000
        if (delay <= 50) continue
        hasFutureCues = true
        const t = setTimeout(() => {
          const morphs = VISEME_TO_MORPHS[cue.value] ?? {}
          console.log('[lipsync] cue', cue.value, morphs)
          morphTargetsRef.current = morphs
        }, delay)
        visemeTimeoutsRef.current.push(t)
      }

      // If all cues are past, reset to neutral after a short hold
      if (!hasFutureCues) {
        const t = setTimeout(() => { morphTargetsRef.current = {} }, 200)
        visemeTimeoutsRef.current.push(t)
      }
    }).catch(() => {})  // keep amplitude on error

    source.onended = () => {
      if (currentSourceRef.current === source) currentSourceRef.current = null
      stopAmplitudeTracking()
      clearVisemeTimeouts()
      morphTargetsRef.current = {}
      playNext()
    }
  }

  async function enqueueUtterance() {
    if (utteranceBufferRef.current.length === 0) return

    const totalSamples = utteranceBufferRef.current.reduce((s: number, c: Int16Array) => s + c.length, 0)
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
    morphTargetsRef.current = {}
    setIsPlaying(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dispose = useCallback(() => {
    clearAudioBuffer()
    audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
  }, [clearAudioBuffer])

  return { playPCMChunk, clearAudioBuffer, dispose, isPlaying, morphTargetsRef }
}
