"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { generateSimliSessionToken, LogLevel, SimliClient } from "simli-client"
import { Home, Phone, Plane, DoorOpen, Clock, MapPin, Pointer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { voiceChatTranslations } from "@/lib/translations/voice-chat-translations"
import {
  type FlightData,
  type FlightWarning,
  formatFlightNumber,
  getAlternativeFormats,
  computeWarnings,
  formatTimeForDisplay,
  getWalkingTime,
} from "@/lib/flight-utils"
import { getElevenLabsSignedUrl } from "../actions/actions"

type LanguageCode = keyof typeof voiceChatTranslations

type ElevenLabsWebSocketEvent =
  | { type: "user_transcript"; user_transcription_event: { user_transcript: string } }
  | { type: "agent_response"; agent_response_event: { agent_response: string } }
  | { type: "audio"; audio_event: { audio_base_64: string; event_id: number } }
  | { type: "interruption"; interruption_event: { reason: string } }
  | { type: "ping"; ping_event: { event_id: number; ping_ms?: number } }
  | { type: "client_tool_call"; client_tool_call: { tool_call_id: string; tool_name: string; parameters: Record<string, string> } }

let simliClient: SimliClient | null = null

export default function VoiceChat() {
  const router = useRouter()

  const [language, setLanguage] = useState<LanguageCode>("en")
  const [languageReady, setLanguageReady] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [callStatus, setCallStatus] = useState("")
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([])
  const [flightData, setFlightData] = useState<FlightData | null>(null)
  const [isLookingUpFlight, setIsLookingUpFlight] = useState(false)
  const [warnings, setWarnings] = useState<FlightWarning[]>([])
  const [isMicMuted, setIsMicMuted] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [avatarReady, setAvatarReady] = useState(false)

  // Satisfaction modal
  const [showSatisfactionModal, setShowSatisfactionModal] = useState(false)
  const [showThankYou, setShowThankYou] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Warning countdown
  const [warningCountdown, setWarningCountdown] = useState(25)

  // Simli + WebSocket refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const websocketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const simliKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSimliAudioTimeRef = useRef<number>(0)

  // Refs to avoid stale closures
  const warningsRef = useRef<FlightWarning[]>([])
  const isCallActiveRef = useRef(false)
  const isMicMutedRef = useRef(true)
  const languageRef = useRef<LanguageCode>("en")
  const flightDataRef = useRef<FlightData | null>(null)

  useEffect(() => { isCallActiveRef.current = isCallActive }, [isCallActive])
  useEffect(() => { warningsRef.current = warnings }, [warnings])
  useEffect(() => { isMicMutedRef.current = isMicMuted }, [isMicMuted])
  useEffect(() => { languageRef.current = language }, [language])
  useEffect(() => { flightDataRef.current = flightData }, [flightData])

  const transcriptRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages])

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const INACTIVITY_TIMEOUT = 60_000

  const t = useMemo(
    () => voiceChatTranslations[language] ?? voiceChatTranslations.en,
    [language]
  )

  useEffect(() => {
    const stored = localStorage.getItem("selectedLanguage")
    if (stored && stored in voiceChatTranslations) {
      setLanguage(stored as LanguageCode)
    }
    setLanguageReady(true)
  }, [])

  useEffect(() => {
    if (!isCallActive) setCallStatus(t.clickToStart)
  }, [language, isCallActive, t])

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(() => {
      localStorage.clear()
      router.push("/")
    }, INACTIVITY_TIMEOUT)
  }, [router])

  useEffect(() => {
    if (isCallActive) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      return
    }
    resetInactivityTimer()
    const events = ["mousedown", "touchstart", "click"] as const
    const handle = () => resetInactivityTimer()
    events.forEach(e => document.addEventListener(e, handle, true))
    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      events.forEach(e => document.removeEventListener(e, handle, true))
    }
  }, [isCallActive, resetInactivityTimer])

  useEffect(() => {
    if (warnings.length === 0) return
    setWarningCountdown(25)
    const timer = setInterval(() => {
      setWarningCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          localStorage.clear()
          router.push("/")
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [warnings, router])

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (isCallActiveRef.current) stopCall()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Audio helpers ──────────────────────────────────────────────────────────

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
    return bytes
  }

  const float32ToBase64PCM = (float32Array: Float32Array): string => {
    const pcmArray = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      pcmArray[i] = Math.floor(Math.max(-1, Math.min(1, float32Array[i])) * 32767)
    }
    const uint8Array = new Uint8Array(pcmArray.buffer)
    let binaryString = ""
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binaryString += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)))
    }
    return btoa(binaryString)
  }

  const setupVoiceStream = async (stream: MediaStream) => {
    streamRef.current = stream

    const audioContext = new AudioContext({ sampleRate: 16000 })
    await audioContext.resume()
    audioContextRef.current = audioContext

    const source = audioContext.createMediaStreamSource(stream)
    sourceRef.current = source

    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    let isProcessing = false
    processor.onaudioprocess = (event) => {
      // PTT: only send audio when mic is active (not muted)
      if (isMicMutedRef.current || isProcessing || websocketRef.current?.readyState !== WebSocket.OPEN) return
      isProcessing = true
      try {
        const inputData = event.inputBuffer.getChannelData(0)
        websocketRef.current?.send(JSON.stringify({ user_audio_chunk: float32ToBase64PCM(inputData) }))
      } finally {
        isProcessing = false
      }
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const stopVoiceStream = () => {
    processorRef.current?.disconnect()
    if (processorRef.current) processorRef.current.onaudioprocess = null
    processorRef.current = null
    sourceRef.current?.disconnect()
    sourceRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  // ── Flight lookup (client tool) ────────────────────────────────────────────

  const lookupFlight = async (params: { flight_number: string }): Promise<string> => {
    setIsLookingUpFlight(true)
    try {
      const { formatted, isValid } = formatFlightNumber(params.flight_number)
      if (!isValid) return JSON.stringify({ error: "Invalid flight number format" })

      let data: FlightData | null = null
      for (const candidate of [formatted, ...getAlternativeFormats(formatted)]) {
        const res = await fetch(`/api/schiphol?flightname=${candidate}`)
        if (res.ok) {
          const json = await res.json() as FlightData & { error?: string }
          if (!json.error) { data = json; break }
        }
      }

      if (!data) return JSON.stringify({ error: "Flight not found" })

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem("flightInfo", JSON.stringify(data))
      localStorage.setItem("sessionId", sessionId)
      localStorage.setItem("selectedLanguage", languageRef.current)

      const flightWarnings = computeWarnings(data)
      setFlightData(data)

      const warningMessages: Record<string, string> = {
        bus_gate: "The passenger's gate is a BUS GATE. They must take a bus from the terminal to the aircraft.",
        departing_soon: "The flight is DEPARTING SOON (within 60 minutes). Please urgently advise the passenger to proceed to their gate immediately.",
        inbound_flight: "This appears to be an ARRIVING (inbound) flight, not a departure.",
      }

      return JSON.stringify({
        ...data,
        active_warnings: flightWarnings,
        warning_instructions: flightWarnings.map(w => warningMessages[w]),
        walking_time: getWalkingTime(data.gate),
      })
    } finally {
      setIsLookingUpFlight(false)
    }
  }

  // ── ElevenLabs WebSocket ───────────────────────────────────────────────────

  const connectToElevenLabs = async (signedUrl: string) => {
    const websocket = new WebSocket(signedUrl)
    websocketRef.current = websocket

    websocket.onopen = async () => {
      websocket.send(JSON.stringify({
        type: "conversation_initiation_client_data",
        conversation_initiation_client_data: {
          custom_llm_extra_body: {},
          conversation_config_override: { agent: { language: languageRef.current } },
        },
      }))
      simliClient?.ClearBuffer()
      await setupVoiceStream(streamRef.current!)
      setIsConnected(true)
      setIsCallActive(true)
      setCallStatus(t.connectedListening)
    }

    websocket.onmessage = async (event) => {
      const data = JSON.parse(event.data) as ElevenLabsWebSocketEvent

      if (data.type === "ping") {
        setTimeout(() => websocket.send(JSON.stringify({ type: "pong", event_id: data.ping_event.event_id })), data.ping_event.ping_ms ?? 0)
        return
      }

      if (data.type === "audio") {
        const audioBytes = base64ToUint8Array(data.audio_event.audio_base_64)
        lastSimliAudioTimeRef.current = Date.now()
        simliClient?.sendAudioData(audioBytes)
        return
      }

      if (data.type === "interruption") {
        simliClient?.ClearBuffer()
        return
      }

      if (data.type === "user_transcript") {
        const text = data.user_transcription_event.user_transcript.trim()
        if (text) setMessages(prev => [...prev, { role: "user", content: text }])
        return
      }

      if (data.type === "agent_response") {
        const text = data.agent_response_event.agent_response.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim()
        if (text) setMessages(prev => [...prev, { role: "assistant", content: text }])
        return
      }

      if (data.type === "client_tool_call") {
        const { tool_call_id, tool_name, parameters } = data.client_tool_call
        let result = JSON.stringify({ error: "Unknown tool" })
        let is_error = false
        try {
          if (tool_name === "lookup_flight") {
            result = await lookupFlight(parameters as { flight_number: string })
          }
        } catch (err) {
          console.error("Tool execution error:", err)
          is_error = true
          result = JSON.stringify({ error: "Tool execution failed" })
        }
        websocket.send(JSON.stringify({ type: "client_tool_result", tool_call_id, result, is_error }))
        return
      }
    }

    websocket.onclose = () => {
      setIsConnected(false)
      setIsCallActive(false)
      setCallStatus(t.callEnded)
      setShowSatisfactionModal(warningsRef.current.length === 0)
      startCountdown()
      stopVoiceStream()
      websocketRef.current = null
    }

    websocket.onerror = (event) => {
      console.error("[ElevenLabs] WebSocket error:", event)
      setCallStatus(t.errorOccurred)
      setIsCallActive(false)
      setIsConnected(false)
    }
  }

  // ── Simli init ─────────────────────────────────────────────────────────────

  const initSimli = async (signedUrl: string) => {
    if (!videoRef.current || !audioRef.current) return

    const sessionToken = (await generateSimliSessionToken({
      apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY as string,
      config: { faceId: process.env.NEXT_PUBLIC_SIMLI_FACE_ID as string, maxIdleTime: 600, maxSessionLength: 600, handleSilence: true },
    })).session_token

    simliClient = new SimliClient(sessionToken, videoRef.current, audioRef.current, null, LogLevel.ERROR, "livekit")

    simliClient.on("start", () => {
      simliClient?.sendAudioData(new Uint8Array(6000).fill(0))
      lastSimliAudioTimeRef.current = Date.now()
      setAvatarReady(true)

      // Keepalive: send silence to Simli every 150ms when no real audio is coming in,
      // to prevent the LiveKit session from timing out during quiet periods.
      simliKeepaliveRef.current = setInterval(() => {
        if (simliClient && Date.now() - lastSimliAudioTimeRef.current > 150) {
          simliClient.sendAudioData(new Uint8Array(6000).fill(0))
        }
      }, 150)

      connectToElevenLabs(signedUrl)
    })

    simliClient.on("speaking", () => setIsSpeaking(true))
    simliClient.on("silent", () => setIsSpeaking(false))

    simliClient.on("startup_error", () => {
      setCallStatus("Avatar kon niet starten")
      setIsCallActive(false)
    })

    await simliClient.start()
  }

  // ── Start call ─────────────────────────────────────────────────────────────

  const handleStartCall = useCallback(async () => {
    try {
      setCallStatus(t.connecting)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream

      const res = await fetch("/api/elevenlabs/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      })

      if (!res.ok) throw new Error(`Session API error: ${res.status}`)

      const sessionData = await res.json() as {
        success: boolean
        sessionType: "public" | "private"
        agentId?: string
        signedUrl?: string
        error?: string
      }

      if (!sessionData.success) throw new Error(sessionData.error ?? "Session creation failed")

      let signedUrl: string
      if (sessionData.signedUrl) {
        signedUrl = sessionData.signedUrl
      } else if (sessionData.agentId) {
        signedUrl = await getElevenLabsSignedUrl(sessionData.agentId)
      } else {
        throw new Error("No agent ID or signed URL in session response")
      }

      await initSimli(signedUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to start voice call:", message)
      setCallStatus(t.failedToConnect)
      setIsCallActive(false)
      setIsConnected(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, t])

  useEffect(() => {
    if (languageReady && !isCallActive) {
      handleStartCall()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageReady])

  // ── Stop call ──────────────────────────────────────────────────────────────

  const stopCall = useCallback(() => {
    if (simliKeepaliveRef.current) {
      clearInterval(simliKeepaliveRef.current)
      simliKeepaliveRef.current = null
    }
    websocketRef.current?.close()
    websocketRef.current = null
    stopVoiceStream()
    simliClient?.stop()
    simliClient = null
    setIsCallActive(false)
    setIsConnected(false)
    setAvatarReady(false)
    setIsSpeaking(false)
    setCallStatus("")
    setMessages([])
    setFlightData(null)
    setWarnings([])
    setIsMicMuted(true)
  }, [])

  const handleEndCall = useCallback(() => {
    stopCall()
  }, [stopCall])

  // ── PTT ────────────────────────────────────────────────────────────────────

  const handlePttStart = useCallback((e: PointerEvent) => {
    e.preventDefault()
    if (!isConnected) return
    setIsMicMuted(false)
  }, [isConnected])

  const handlePttEnd = useCallback(() => {
    setIsMicMuted(true)
    // Send 500ms of silence so ElevenLabs VAD detects end-of-speech
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      const silence = new Float32Array(8000) // 500ms at 16kHz, all zeros
      websocketRef.current.send(JSON.stringify({ user_audio_chunk: float32ToBase64PCM(silence) }))
    }
  }, [])

  // ── Satisfaction countdown ─────────────────────────────────────────────────

  const startCountdown = useCallback(() => {
    setCountdown(10)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          countdownIntervalRef.current = null
          router.push("/")
          return 0
        }
        return prev - 1
      })
    }, 1000)
    countdownIntervalRef.current = interval
  }, [router])

  const clearCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
  }, [])

  const handleRatingSubmit = useCallback(async (rating: number) => {
    clearCountdown()
    try {
      const sessionId = localStorage.getItem("sessionId")
      await fetch("/api/satisfaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, language, flightData: flightDataRef.current, sessionId }),
      })
    } catch (err) {
      console.error("Rating submit error:", err)
    }
    setShowThankYou(true)
    setTimeout(() => router.push("/"), 2_000)
  }, [language, router, clearCountdown])

  const handleSkipRating = useCallback(() => {
    clearCountdown()
    router.push("/")
  }, [router, clearCountdown])

  // ── Derived visual state ───────────────────────────────────────────────────

  const isMicActive = isConnected && !isMicMuted
  const isIdle = isConnected && isMicMuted && !isSpeaking
  const activeWarning = warnings[0] ?? null

  const ratingOptions = [
    { value: 1, emoji: "😠", label: t.veryDissatisfied, color: "text-red-500" },
    { value: 2, emoji: "☹️", label: t.dissatisfied,     color: "text-orange-500" },
    { value: 3, emoji: "😐", label: t.neutral,          color: "text-yellow-500" },
    { value: 4, emoji: "😊", label: t.satisfied,        color: "text-green-500" },
    { value: 5, emoji: "😄", label: t.verySatisfied,    color: "text-green-600" },
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-8 gap-6 animate-fade-in">

      {/* Header */}
      <div className="w-full max-w-2xl flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => { localStorage.clear(); router.push("/") }}
          disabled={isCallActive}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <Home className="h-5 w-5" />
          <span className="font-medium">{t.restart}</span>
        </Button>
        <div className="text-right flex flex-col items-end gap-0.5">
          <p className="text-3xl font-bold tracking-tight text-foreground leading-none">APEX</p>
          <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground leading-none">
            AI for PRM Experience & Execution
          </p>
        </div>
      </div>

      {/* Centre — avatar + controls */}
      <div className="flex flex-col items-center gap-8 flex-1 justify-center w-full max-w-2xl">

        {/* Simli avatar — tap and hold to speak (push-to-talk) */}
        <div
          className={["relative flex items-center justify-center w-64 h-64 select-none rounded-full overflow-hidden", isConnected ? "cursor-pointer" : ""].join(" ")}
          style={{ touchAction: "none", WebkitTapHighlightColor: "transparent", WebkitTouchCallout: "none" }}
          onPointerDown={handlePttStart}
          onPointerUp={handlePttEnd}
          onPointerLeave={handlePttEnd}
          onPointerCancel={handlePttEnd}
          onContextMenu={(e: MouseEvent) => e.preventDefault()}
        >
          {/* Expanding rings when AI is speaking */}
          {isSpeaking && (
            <>
              <div className="absolute inset-0 rounded-full border border-accent/50 animate-pulse-ring" />
              <div className="absolute inset-0 rounded-full border border-accent/25 animate-pulse-ring" style={{ animationDelay: "0.65s" }} />
              <div className="absolute inset-0 rounded-full border border-accent/12 animate-pulse-ring" style={{ animationDelay: "1.3s" }} />
            </>
          )}

          {/* Expanding rings when mic is open (PTT active) */}
          {isMicActive && (
            <>
              <div className="absolute inset-0 rounded-full border border-green-500/50 animate-pulse-ring" />
              <div className="absolute inset-0 rounded-full border border-green-500/25 animate-pulse-ring" style={{ animationDelay: "0.65s" }} />
              <div className="absolute inset-0 rounded-full border border-green-500/12 animate-pulse-ring" style={{ animationDelay: "1.3s" }} />
            </>
          )}

          {/* Avatar video */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={[
              "absolute inset-0 w-full h-full object-cover rounded-full transition-opacity duration-500",
              "border-2",
              isSpeaking
                ? "border-accent shadow-[0_0_64px_hsl(214_100%_40%/0.30)]"
                : isMicActive
                  ? "border-green-500 shadow-[0_0_64px_rgba(34,197,94,0.30)]"
                  : isIdle
                    ? "border-primary/40 animate-breathe"
                    : "border-border",
              avatarReady ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
          <audio ref={audioRef} autoPlay />

          {/* Placeholder while avatar loads */}
          {!avatarReady && (
            <div
              className={[
                "absolute inset-0 rounded-full border-2 flex items-center justify-center",
                "transition-[background-color,border-color,box-shadow] duration-300",
                "bg-gradient-to-br from-secondary to-muted border-border shadow-[inset_0_1px_2px_rgba(255,255,255,0.8),0_4px_24px_hsl(215_47%_18%/0.08)]",
              ].join(" ")}
            >
              {isLookingUpFlight ? (
                <div className="w-16 h-16 rounded-full border-4 border-accent border-t-transparent animate-spin" />
              ) : isCallActive ? (
                <div className="w-16 h-16 rounded-full border-4 border-accent/30 border-t-accent animate-spin" />
              ) : (
                <div className="flex items-end gap-1.5 h-14">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="w-1.5 rounded-full bg-muted-foreground/25" style={{ height: "6px", transitionDelay: `${i * 35}ms` }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PTT hand indicator */}
        {isConnected && isMicMuted && (
          <div className="-mt-4 animate-fade-in relative flex items-center justify-center">
            <svg viewBox="0 0 40 12" className="absolute -top-3 w-10 h-3 opacity-40" fill="none" stroke="hsl(215 47% 18%)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 10 Q20 2 30 10" />
              <path d="M14 6 Q20 0 26 6" />
            </svg>
            <Pointer className="h-9 w-9 text-primary/40 animate-tap" strokeWidth={1.5} />
          </div>
        )}

        {/* Status text */}
        <div className="text-center space-y-1">
          <p className="text-xl font-semibold text-foreground">{callStatus}</p>
          {isConnected && (
            <p className={`text-base ${isIdle ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {isSpeaking ? t.aiIsSpeaking : isMicActive ? t.connectedListening : t.holdToSpeak}
            </p>
          )}
        </div>

        {/* Call button */}
        {!isCallActive ? (
          <Button
            onClick={handleStartCall}
            disabled={callStatus === t.connecting}
            className="h-16 px-12 text-xl font-semibold rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_4px_24px_hsl(215_47%_18%/0.30)] active:scale-95 transition-all relative overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none rounded-2xl" />
            <Phone className="h-6 w-6 mr-3" />
            {callStatus === t.connecting ? t.connecting : t.startVoiceChat}
          </Button>
        ) : (
          <Button
            onClick={handleEndCall}
            variant="destructive"
            className="h-14 px-10 text-lg rounded-2xl active:scale-95 shadow-[0_4px_20px_hsl(0_84%_60%/0.25)]"
          >
            <Phone className="h-5 w-5 mr-2" />
            {t.endCall}
          </Button>
        )}

        {/* Flight info card */}
        {flightData && warnings.length === 0 && (
          <div className="w-full rounded-2xl border border-border bg-gradient-to-b from-secondary/80 to-secondary/40 p-6 animate-slide-up shadow-sm">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border/60">
              <div className="w-1 h-5 rounded-full bg-accent" />
              <p className="text-xs font-semibold tracking-[0.12em] uppercase text-accent">Your Flight</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Plane className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.flight}</p>
                </div>
                <p className="font-bold text-lg text-foreground">{flightData.flightName}</p>
              </div>
              {flightData.destination && (
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.destination}</p>
                  </div>
                  <p className="font-bold text-lg text-foreground">{flightData.destination}</p>
                </div>
              )}
              {flightData.gate && (
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <DoorOpen className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.gate}</p>
                  </div>
                  <p className="font-bold text-lg text-foreground">{flightData.gate}</p>
                </div>
              )}
              {flightData.scheduleTime && (
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Departure</p>
                  </div>
                  <p className="font-bold text-lg text-foreground">{flightData.scheduleTime}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Conversation transcript */}
        {messages.length > 0 && (
          <div ref={transcriptRef} className="w-full rounded-2xl border border-border bg-card p-4 max-h-36 overflow-y-auto">
            <div className="space-y-2 text-sm">
              {messages.map((msg, i) => (
                <div key={i} className="flex gap-2">
                  <span className={`font-semibold shrink-0 ${msg.role === "user" ? "text-accent" : "text-primary"}`}>
                    {msg.role === "user" ? t.you : t.ai}
                  </span>
                  <span className="text-foreground">{msg.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Privacy notice */}
      <p className="text-xs text-muted-foreground tracking-wide text-center pb-2">
        {t.privacyNotice}
      </p>

      {/* Warning overlay */}
      {activeWarning && (
        <WarningOverlay
          warning={activeWarning}
          flightData={flightData}
          countdown={warningCountdown}
          onDismissInbound={() => setWarnings(prev => prev.slice(1))}
          onHome={() => { localStorage.clear(); router.push("/") }}
        />
      )}

      {/* Satisfaction modal */}
      {showSatisfactionModal && warnings.length === 0 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
          <div className="bg-card rounded-3xl border border-border shadow-2xl max-w-2xl w-full p-8 animate-slide-up">
            {!showThankYou ? (
              <>
                <h2 className="text-3xl font-bold text-center text-foreground mb-8">
                  {t.rateOurService}
                </h2>
                <div className="grid grid-cols-5 gap-3 mb-8">
                  {ratingOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleRatingSubmit(opt.value)}
                      className="flex flex-col items-center gap-3 p-4 rounded-2xl border-2 border-border hover:border-accent hover:bg-secondary transition-all active:scale-95"
                    >
                      <span className="text-5xl">{opt.emoji}</span>
                      <span className={`text-xs font-medium text-center ${opt.color}`}>{opt.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t.returningHome} {countdown} {t.seconds}
                  </p>
                  <Button variant="ghost" onClick={handleSkipRating} className="text-muted-foreground">
                    {t.skipRating}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-6">✓</div>
                <h2 className="text-3xl font-bold text-foreground">{t.thankYou}</h2>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Warning Overlay ────────────────────────────────────────────────────────────

interface WarningOverlayProps {
  warning: FlightWarning
  flightData: FlightData | null
  countdown: number
  onDismissInbound: () => void
  onHome: () => void
}

function WarningOverlay({ warning, flightData, countdown, onDismissInbound, onHome }: WarningOverlayProps) {
  const configs: Record<FlightWarning, { emoji: string; title: string; body: string; allowContinue: boolean }> = {
    bus_gate: {
      emoji: "🚌",
      title: "Bus Transfer Required",
      body: flightData?.gate
        ? `Gate ${flightData.gate} is served by a bus. Please allow extra time and follow the signs to the bus gates.`
        : "Your gate is served by a bus. Please allow extra time.",
      allowContinue: false,
    },
    departing_soon: {
      emoji: "⚡",
      title: "Your flight departs soon",
      body: flightData?.scheduleDateTime
        ? `Departure at ${formatTimeForDisplay(flightData.scheduleDateTime)}. Please proceed to your gate immediately.`
        : "Please proceed to your gate immediately.",
      allowContinue: false,
    },
    inbound_flight: {
      emoji: "✈️",
      title: "Arriving flight detected",
      body: "This appears to be an arriving flight, not a departure. Please check your flight number and try again.",
      allowContinue: true,
    },
  }

  const { emoji, title, body, allowContinue } = configs[warning]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6 animate-fade-in" onClick={onHome}>
      <div className="bg-card rounded-3xl border-2 border-border shadow-2xl max-w-xl w-full p-10 text-center space-y-6 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="text-7xl">{emoji}</div>
        <h2 className="text-3xl font-bold text-foreground">{title}</h2>
        <p className="text-xl text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex gap-3 justify-center pt-2">
          {allowContinue && (
            <Button onClick={onDismissInbound} className="h-14 px-8 text-lg rounded-2xl bg-primary text-primary-foreground">
              Try again
            </Button>
          )}
          <Button
            onClick={onHome}
            variant={allowContinue ? "outline" : "default"}
            className="h-14 px-8 text-lg rounded-2xl"
          >
            Return home ({countdown}s)
          </Button>
        </div>
      </div>
    </div>
  )
}
