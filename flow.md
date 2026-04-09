# APEX — User Flow Documentation

## Overview

APEX follows a minimal two-screen journey. Language selection and voice activation are the only steps before a passenger is in a live AI conversation. There is no form to fill in — the flight number is captured conversationally by the AI agent.

### Flow Principles
- **Voice-First**: No typing required at any step
- **Language-First**: Language selection before any other interaction; language passed as override to single ElevenLabs agent
- **Push-to-Talk**: Passenger holds the avatar circle to speak; releasing triggers the AI response
- **Minimal Steps**: 1 tap to reach active conversation (flag tap → auto-start)
- **Self-Resetting**: Inactivity timers return the kiosk to the home screen automatically

---

## Primary User Flow

```
Home / Language Select (/)  →  Voice Chat (/voice-chat)
         ↓                              ↓
   Tap language flag          Auto-connect: mic permission +
         ↓                    Simli session + ElevenLabs WS
  Store language in                       ↓
   localStorage               Simli avatar appears (video)
                              Agent greets in selected language
                                          ↓
                              Hold avatar circle → speak
                              Release → AI processes (VAD)
                                          ↓
                             Agent asks for flight number
                                          ↓
                         Agent confirms: "K… L… 0… 5… 9…"
                                          ↓
                          lookup_flight tool called →
                          Schiphol API fetched server-side
                                          ↓
                     ┌────────────────────┴──────────────────┐
                     │                                       │
               Warnings found                          No warnings
                     │                                       │
         Warning overlay shown (25s)          Flight info card slides up
         Agent speaks warning aloud           Agent continues conversation
                     │                         (hold to ask follow-ups)
             Auto-redirect home                              │
                                            Call ends → Satisfaction modal
                                                            ↓
                                               Auto-redirect home (10s)
```

---

## Screen-by-Screen Breakdown

### Screen 1: Home / Language Selection (`/`)

**Purpose**: Language selection — the only entry point into APEX.

**Layout:**
- App title and subtitle at top
- Vertical scrollable list of 11 languages, staggered animation on load:
  - 🇬🇧 English, 🇸🇦 العربية, 🇨🇳 中文, 🇳🇱 Nederlands
  - 🇫🇷 Français, 🇩🇪 Deutsch, 🇮🇳 हिन्दी, 🇯🇵 日本語
  - 🇵🇹 Português, 🇪🇸 Español, 🇹🇷 Türkçe
- Each row: flag + native name (large) + English name (small caps)

**User Actions:**
- Tap any language → store `selectedLanguage` in `localStorage` → navigate to `/voice-chat`

**Session Reset:**
- On return from voice chat, `localStorage` is cleared
- 60-second inactivity timer on `/voice-chat` returns user here

---

### Screen 2: Voice Chat (`/voice-chat`)

**Purpose**: The primary interaction screen — voice orb, status, and all contextual UI.

#### 2a. Pre-Call State / Auto-connecting

On arrival from the home screen, the call starts automatically. Mic permission is requested immediately, then Simli and ElevenLabs sessions are established. The Start Voice Chat button remains visible as a manual fallback.

**Layout:**
- Back button (Home icon) — enabled
- "APEX" title top right
- Avatar circle (placeholder state → transitions to Simli video once ready)
- Status label: "Connecting…" (auto-triggered)
- **Start Voice Chat** button (fallback)

#### 2b. Connecting

**Sequence:**
```
Language tapped on home screen → /voice-chat loads
    ↓
getUserMedia({ echoCancellation: false, noiseSuppression: false, autoGainControl: false })
    ↓
POST /api/elevenlabs/create-session  { language }
    ↓
Response: { sessionType: "public", agentId }
       OR { sessionType: "private", signedUrl }
    ↓
generateSimliSessionToken() → SimliClient.start()
    ↓
Simli "start" event → sendAudioData(silence) → connectToElevenLabs(signedUrl)
    ↓
ElevenLabs WebSocket open → send conversation_initiation_client_data (with language override)
    ↓
setupVoiceStream(stream) → ScriptProcessorNode active
    ↓
Status: "Connected" — Simli avatar visible, agent greets in selected language
```

#### 2c. Active Call

**Visual states:**
| State | Avatar appearance |
|---|---|
| AI speaking | Blue accent border + glow, 3× expanding blue pulse rings |
| PTT active (holding) | Green border + glow, 3× expanding green pulse rings |
| Idle / waiting | Navy border, gentle breathing scale animation |
| Loading avatar | Spinner (before Simli video appears) |
| Looking up flight | Blue spinner overlay (during `lookup_flight` tool execution) |

**Status labels (localised):**
- Connected: "Connected"
- AI speaking: "APEX is speaking"
- PTT active: "Listening…"
- Idle: "Hold to speak" (bold, with tap-and-hold icon + arc animations below avatar)

**PTT interaction:**
```
Passenger holds avatar circle
    ↓
onPointerDown → setIsMicMuted(false) → audio chunks sent to ElevenLabs WS
    ↓
Passenger releases
    ↓
onPointerUp → setIsMicMuted(true) → send 500ms silence → ElevenLabs VAD triggers
    ↓
ElevenLabs processes speech → agent responds → Simli animates
```

**Voice conversation flow (inside ElevenLabs agent):**
1. Agent greets passenger in the selected language
2. Agent asks for flight number
3. Agent confirms letter by letter: *"K… L… zero… five… nine… Is that correct?"*
4. On confirmation → agent calls `lookup_flight` tool (orb shows spinner)
5. Tool fetches Schiphol API data, computes warnings, updates React state
6. Tool returns flight JSON + `active_warnings` + `warning_instructions` to agent
7. If warnings exist → agent speaks warning instructions before anything else
8. Agent answers follow-up questions with full flight context
9. Agent calls `end_call` to close the session

**Active call UI elements:**
- **End Call** button (destructive)
- Flight info card (slides up after successful lookup, only shown when no active warning)
- Conversation transcript (scrollable, max 36 lines visible)

#### 2d. Warning Overlays

Triggered when `computeWarnings(flightData)` returns one or more warnings.

| Warning | Trigger | Emoji | Allows Continue | Priority |
|---|---|---|---|---|
| `inbound_flight` | `flightDirection === "A"` (arriving) | ✈️ | Yes — "Try again" | Shown alone — wrong flight number |
| `departing_soon` | Departure within 60 minutes | ⚡ | No — redirect home | Supersedes `bus_gate` |
| `bus_gate` | Gate identifier is a bus gate | 🚌 | No — redirect home | Only if above two not triggered |

Exactly one warning is shown at a time — warnings are mutually exclusive by priority.

**Overlay behaviour:**
- Full-screen modal, 70% black backdrop
- 25-second countdown → auto-redirect to home (`localStorage` cleared)
- Agent simultaneously speaks the warning aloud (via `warning_instructions` in tool response)
- `bus_gate` / `departing_soon`: only "Return home (Xs)" button
- `inbound_flight`: "Try again" button (dismisses overlay) + "Return home (Xs)" button

#### 2e. Post-Call — Satisfaction Modal

Shown after call ends cleanly (no active warning overlay).

**Layout:**
- "Rate our service" heading (localised)
- 5 emoji rating buttons: 😠 😟 😐 😊 😄
- 10-second auto-redirect countdown
- "Skip" link

**Sequence:**
```
Rating selected → POST /api/satisfaction { rating, language, flightData, sessionId }
              → "Thank you" screen (2s) → redirect to /
Skip selected  → redirect to /
Countdown hits 0 → redirect to /
```

---

## Alternative Flows

### Flight Not Found
```
Agent asks for flight number
    ↓
lookup_flight called with "KL4140"
    ↓
Schiphol API returns 404 for all format variants
    ↓
Tool returns: { error: "Flight not found" }
    ↓
Agent informs passenger, offers to help with general questions
(No flight card shown, no warnings)
```

### Invalid Flight Number Format
```
Agent hears something ambiguous
    ↓
lookup_flight called
    ↓
formatFlightNumber() returns { isValid: false }
    ↓
Tool returns: { error: "Invalid flight number format" }
    ↓
Agent asks passenger to repeat or spell out the flight number
```

### Direct URL Access
```
Direct access to /voice-chat without language set:
    ↓
localStorage.getItem("selectedLanguage") → null or invalid
    ↓
Defaults to "en" (English agent used)

Direct access to /language-select:
    ↓
Server redirect → / (home page)
```

### Inactivity (No Call Active)
```
No user interaction for 60 seconds on /voice-chat
    ↓
localStorage.clear()
    ↓
router.push("/")
```

---

## Data Flow

### localStorage Keys
| Key | Set when | Value |
|---|---|---|
| `selectedLanguage` | Language flag tapped | `"en"`, `"nl"`, `"zh"`, etc. |
| `flightInfo` | `lookup_flight` tool succeeds | Full Schiphol flight JSON |
| `sessionId` | `lookup_flight` tool succeeds | Generated session identifier |

All keys are cleared on home navigation or inactivity timeout.

### API Routes
| Route | Method | Purpose |
|---|---|---|
| `/api/elevenlabs/create-session` | POST | Returns agent ID or signed URL for the selected language |
| `/api/schiphol` | GET | Proxies Schiphol API flight lookup (server-side auth) |
| `/api/satisfaction` | POST | Submits satisfaction rating to webhook |

### ElevenLabs Client Tool: `lookup_flight`
```
Agent triggers tool with: { flight_number: "KL059" }
    ↓
Browser executes lookup_flight() via WebSocket client_tool_call message:
    ├── formatFlightNumber("KL059") → { formatted: "KL059", isValid: true }
    ├── Try: /api/schiphol?flightname=KL059
    ├── If 404: try getAlternativeFormats() variants
    ├── computeWarnings(data) → e.g. ["bus_gate"]
    ├── setFlightData(data) — updates React UI (flight card)
    └── return JSON.stringify({
            ...flightData,
            active_warnings: ["bus_gate"],
            warning_instructions: ["The passenger's gate is a BUS GATE..."],
            walking_time: { distanceM: "1500-1600", minutes: "15-16",
                            summary: "approximately 1500-1600 meters, which usually takes 15-16 minutes" }
        })
    ↓
Browser sends client_tool_result back over WebSocket
    ↓
ElevenLabs agent receives response, speaks warning, continues conversation
```

### Simli Audio Bridge
```
ElevenLabs WebSocket → "audio" event (base64 PCM)
    ↓
base64ToUint8Array(audio_event.audio_base_64)
    ↓
simliClient.sendAudioData(bytes) → Simli LiveKit → avatar animates + speaks

Between ElevenLabs audio events (silence periods):
    ↓
Keepalive interval (every 150ms): simliClient.sendAudioData(silence) → LiveKit stays alive
```

---

## State Transitions (Voice Chat Page)

```
IDLE
  ↓ (language selected → auto-start OR tap Start Voice Chat)
CONNECTING (getUserMedia → Simli init → ElevenLabs WS)
  ↓ (Simli "start" + ElevenLabs "onopen")
ACTIVE — IDLE / WAITING (avatar visible, mic muted)
  ↓ (passenger holds avatar)
ACTIVE — PTT OPEN (mic active, sending audio chunks)
  ↓ (passenger releases)
ACTIVE — VAD PROCESSING (500ms silence sent, ElevenLabs processing)
  ↓ (agent responds)
ACTIVE — AI SPEAKING (Simli avatar animates, agent audio plays)
  ↓ (lookup_flight called)
ACTIVE — LOOKING UP FLIGHT (spinner shown)
  ↓ (tool returns)
ACTIVE — IDLE / WAITING  [loop: hold to ask follow-ups]
  ↓ (call ends)
ENDED
  ↓ (warnings present?)
  ├── YES → WARNING OVERLAY (25s) → HOME
  └── NO  → SATISFACTION MODAL (10s) → HOME
```
