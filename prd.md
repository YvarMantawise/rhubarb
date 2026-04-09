# APEX — Product Requirements Document

## Executive Summary

APEX is an AI-powered voice assistant designed to enhance the travel experience for passengers with reduced mobility at Amsterdam Schiphol Airport. Deployed as a kiosk application on a 13" iPad, APEX combines real-time Schiphol flight data with natural-language voice conversations to provide personalised, multilingual assistance without requiring passengers to type, queue, or navigate complex interfaces.

### Key Value Proposition
- **Live Avatar**: A realistic 3D animated face speaks and listens — passengers interact with a person-like presence, not a button
- **Push-to-Talk**: Passengers hold the avatar to speak; releasing triggers the AI response — prevents airport ambient noise from interfering
- **Instant Flight Context**: Live gate, departure time, and check-in data fetched mid-conversation via the Schiphol API
- **Proactive Warnings**: Automatically detects and communicates critical situations (bus gates, imminent departures, inbound flights)
- **Multilingual**: Serves international travellers in 11 languages via a single ElevenLabs agent with language override

### Presentation Context
APEX is being showcased at the **Passenger Terminal Exposition (PTE)** in London, with an expected audience of ~13,000 visitors. The kiosk runs on a 13" iPad and must be immediately intuitive to any visitor without prior instruction.

---

## Product Overview

### Vision Statement
To become the primary digital assistant for Schiphol Airport travellers with reduced mobility — a seamless, voice-enabled companion that reduces travel stress and improves passenger confidence.

### Mission
Deliver personalised, multilingual flight assistance through a minimal two-step interface that integrates with Schiphol's live operations data and requires zero training to use.

### Product Type
Web application (Next.js), deployed on Vercel, optimised for 13" iPad kiosk use.

---

## Target Users

### Primary Users
- **Passengers with reduced mobility** at Amsterdam Schiphol Airport
  - Elderly passengers who prefer voice over touchscreens
  - Passengers with visual or physical impairments
  - Non-native speakers who benefit from voice in their own language
  - Any traveller who needs quick, hands-free flight information

---

## User Stories

### Epic 1: Flight Information Access
**As a traveller with reduced mobility**, I want to quickly get my flight information so that I can navigate the airport efficiently.

- **Story 1.1**: As a passenger, I want to speak my flight number and have the assistant look it up automatically.
- **Story 1.2**: As a passenger, I want to be warned immediately if my gate requires a bus transfer so I can allow extra time.
- **Story 1.3**: As a passenger, I want to be urgently alerted if my flight is departing within 60 minutes.
- **Story 1.4**: As a passenger, I want confirmation if I accidentally provide an arriving flight number instead of a departure.

### Epic 2: Multilingual Communication
**As an international traveller**, I want to interact in my native language so that I can understand information clearly.

- **Story 2.1**: As a Chinese tourist, I want to select Chinese and receive responses in Mandarin from a dedicated Mandarin agent.
- **Story 2.2**: As a Spanish speaker, I want voice responses in Spanish with proper pronunciation.
- **Story 2.3**: As an Arabic speaker, I want to be served by an Arabic-language agent.
- **Story 2.4**: As a Turkish visitor, I want to interact entirely in Turkish.

### Epic 3: Voice Interaction
**As a user**, I want natural voice conversations so that I can get help without using my hands.

- **Story 3.1**: As a passenger with luggage, I want fully hands-free voice interaction after tapping my language flag.
- **Story 3.2**: As a visually impaired traveller, I want all critical information read aloud to me clearly.
- **Story 3.3**: As an expo visitor, I want the assistant to feel polished and premium within seconds of interaction.

---

## Functional Requirements

### F1: Language Selection
- **F1.1**: Support for 11 languages: English, Arabic, Chinese, Dutch, French, German, Hindi, Japanese, Portuguese, Spanish, Turkish
- **F1.2**: Visual language picker on the home screen — vertical scrollable list with flag, native name, and English name per language
- **F1.3**: Single tap selects language and navigates directly to the voice chat screen
- **F1.4**: Selected language stored in `localStorage` and passed as a conversation override to the single ElevenLabs agent

### F2: Flight Data Integration (via ElevenLabs Client Tool)
- **F2.1**: Real-time integration with Schiphol Airport API
- **F2.2**: Flight data is fetched **mid-conversation** via an ElevenLabs client tool (`lookup_flight`) — not before the call starts
- **F2.3**: The agent asks the passenger for their flight number conversationally, confirms it letter-by-letter, then triggers the tool
- **F2.4**: The client tool normalises and validates the flight number, then tries multiple format variants (e.g. KL059, KL59) against the Schiphol API
- **F2.5**: Successful lookup retrieves: gate, terminal, departure time, check-in status, destination, flight direction
- **F2.6**: The tool response includes `active_warnings` and `warning_instructions` so the agent can speak warnings aloud
- **F2.7**: The tool response includes `walking_time` (`distanceM`, `minutes`, `summary`) computed from the gate letter via `getWalkingTime()` in `lib/flight-utils.ts` — eliminates reliance on prompt-embedded reference data

### F3: Warning System
- **F3.1**: Warnings are computed by `computeWarnings()` in `lib/flight-utils.ts` based on the flight data
- **F3.2**: Three warning types (mutually exclusive — exactly one is shown at a time):
  - `inbound_flight` — flight direction is inbound (arriving), not outbound; always shown alone as it indicates a wrong flight number
  - `departing_soon` — flight departs within 60 minutes; takes priority over `bus_gate`
  - `bus_gate` — gate is served by a bus; only shown when the above two are not triggered
- **F3.3**: Warnings trigger a full-screen overlay in the UI with a 25-second countdown before auto-redirecting home
- **F3.4**: Warning text and urgency are also passed to the AI agent via the tool response, so the agent speaks them aloud
- **F3.5**: The `bus_gate` and `departing_soon` warnings redirect home after countdown; `inbound_flight` allows the passenger to try again

### F4: Voice Assistant
- **F4.1**: Each language has a dedicated ElevenLabs agent with a tailored system prompt
- **F4.2**: The agent opens in the passenger's selected language, asks for their flight number, confirms it, calls `lookup_flight`, then continues the conversation with full flight context
- **F4.3**: If `warning_instructions` are present in the tool response, the agent speaks them clearly and completely before continuing
- **F4.4**: Agent can end the conversation by calling the `end_call` tool
- **F4.5**: Conversation transcript displayed in real-time in the UI

### F5: Voice Chat UI
- **F5.1**: Simli live avatar — circular video element showing an animated face; expanding blue rings when AI speaks, expanding green rings when PTT mic is active, breathing border animation when idle
- **F5.2**: Push-to-talk: passenger holds the avatar circle to open the mic; releasing sends trailing silence to trigger ElevenLabs VAD and mutes the mic
- **F5.3**: PTT hand indicator (tap-and-hold icon with arc animations) shown when connected and mic is muted — guides the user to hold to speak
- **F5.4**: Flight info card slides up after a successful `lookup_flight` call (only shown when no active warning)
- **F5.5**: Full-screen warning overlays with countdown, emoji, title, body text, and action buttons
- **F5.6**: Call controls: Start Voice Chat button, End Call button
- **F5.7**: Home button (disabled during active call) to return to language selection

### F6: Post-Call Satisfaction Modal
- **F6.1**: After call ends (and no active warning), a satisfaction rating modal appears
- **F6.2**: 5-point emoji rating scale (very dissatisfied → very satisfied)
- **F6.3**: Ratings submitted to a webhook via `/api/satisfaction`
- **F6.4**: 10-second countdown before auto-redirect to home; user can skip
- **F6.5**: "Thank you" confirmation shown after rating is submitted

### F7: Session Management
- **F7.1**: 60-second inactivity timer on the voice chat screen (when no call is active) — auto-redirects to home
- **F7.2**: `localStorage` used for session state: `selectedLanguage`, `flightInfo`, `sessionId`
- **F7.3**: `localStorage` cleared on home navigation or inactivity timeout

---

## Technical Requirements

### T1: Frontend Architecture
- **T1.1**: Next.js 15 (App Router) with React 19
- **T1.2**: TypeScript — strict type safety enforced throughout
- **T1.3**: Tailwind CSS v3 with shadcn/ui design tokens
- **T1.4**: Deployed on Vercel

### T2: Voice Technology Stack
- **T2.1**: ElevenLabs Conversational AI via raw WebSocket (not `@elevenlabs/react` hook — raw WS required for Simli audio interception)
- **T2.2**: `clientTools` implemented manually over the WebSocket for mid-conversation Schiphol API calls
- **T2.3**: Session established via signed URL (private) or public agent ID
- **T2.4**: Single English agent with language override via `conversation_config_override` at session init
- **T2.5**: Simli live avatar (`simli-client` v3, LiveKit transport) — receives raw PCM bytes from ElevenLabs audio events via `sendAudioData()`
- **T2.6**: Simli keepalive: silence bytes sent every 150ms when ElevenLabs is not streaming audio, to prevent LiveKit session timeout
- **T2.7**: PTT mic: `getUserMedia` with `echoCancellation/noiseSuppression/autoGainControl: false`; trailing 500ms silence sent on PTT release to trigger ElevenLabs VAD

### T3: API Integration
- **T3.1**: Schiphol Airport API proxied via `/api/schiphol` (server-side, credentials hidden)
- **T3.2**: ElevenLabs session API at `/api/elevenlabs/create-session`
- **T3.3**: Satisfaction webhook at `/api/satisfaction`
- **T3.4**: Flight number normalisation and multi-format retry in `lib/flight-utils.ts`

### T4: Design System
- **T4.1**: Deep navy primary (`hsl(215 47% 18%)`) — WCAG AAA contrast on white (~11:1)
- **T4.2**: Accessible blue accent (`hsl(214 100% 40%)`) — WCAG AA with white text (~5.9:1)
- **T4.3**: Border radius `0.75rem`; smooth animations for orb, cards, and overlays
- **T4.4**: Font smoothing and `touch-action: manipulation` for iPad kiosk use

---

## User Experience Requirements

### UX1: Accessibility
- **UX1.1**: WCAG 2.1 AA compliance minimum; primary colours meet AAA
- **UX1.2**: All critical information communicated via voice as well as visually
- **UX1.3**: Large touch targets suitable for users with limited dexterity
- **UX1.4**: High-contrast light theme throughout

### UX2: Usability
- **UX2.1**: Maximum **1 tap** to reach the voice chat screen — language flag tap navigates immediately; call connects automatically
- **UX2.2**: No typing required at any point; flight number captured conversationally
- **UX2.2a**: PTT interaction is self-explanatory — tap-and-hold icon with arc animations guides the user without instruction text
- **UX2.3**: Clear visual hierarchy; single obvious action per screen
- **UX2.4**: Self-resetting kiosk — inactivity timer returns to home automatically

### UX3: Internationalization
- **UX3.1**: UI copy translated for all 8 languages (via `lib/translations/voice-chat-translations.ts`)
- **UX3.2**: Each language served by a dedicated ElevenLabs agent with native language prompt
- **UX3.3**: Language routed at session creation — no runtime switching

---

## Performance Requirements

### P1: Response Time
- **P1.1**: Language selection response: < 200ms
- **P1.2**: Flight data retrieval (via client tool): < 3 seconds
- **P1.3**: Voice session activation: < 2 seconds
- **P1.4**: Voice response latency: < 3 seconds (ElevenLabs platform)

### P2: Availability
- **P2.1**: 99.5% uptime during PTE demo hours
- **P2.2**: Graceful error handling when Schiphol API is unavailable (agent notified via tool error response)

---

## Security & Privacy

### S1: Data Protection
- **S1.1**: No permanent storage of personal conversation data
- **S1.2**: Flight data stored only in session-scoped `localStorage`, cleared on reset
- **S1.3**: GDPR compliance — minimal data collection, no PII stored server-side

### S2: API Security
- **S2.1**: Schiphol API credentials server-side only (Next.js API routes)
- **S2.2**: ElevenLabs API key and agent IDs server-side only — no `NEXT_PUBLIC_` prefix on sensitive variables
- **S2.3**: All endpoints served over HTTPS (Vercel enforced)
- **S2.4**: Next.js kept up-to-date; CVE-2025-66478 patched (upgraded to 15.3.9)
