# APEX — Ontwikkellog

AI for PRM Experience & Execution — Voice assistant kiosk voor Schiphol Airport (PTE demo)

---

## Branches

| Branch | Omschrijving |
|--------|-------------|
| `main` | Actieve productie-branch — single-agent architectuur |
| `backup/pre-single-agent-main` | Vorige main — multi-agent per taal |
| `backup/pre-flagship-redesign` | Versie vóór de flagship language selector redesign |
| `feature/single-agent-language-override` | Ontwikkelbranch (nu gemerged naar main) |

---

## Architectuurbeslissingen

### Single-agent language override (huidig)
In plaats van een aparte ElevenLabs agent per taal, wordt nu één Engelse agent (`ELEVENLABS_AGENT_EN`) gebruikt. De taal wordt client-side overschreven via `conversation.startSession({ overrides: { agent: { language } } })`.

**Voordelen:** één systeem-prompt te onderhouden, geen synchronisatie tussen agents, minder env vars.
**Vereiste env var:** alleen `ELEVENLABS_AGENT_EN`.

### Client tool / server-proxy patroon
De ElevenLabs agent roept browser-side JavaScript aan (`lookup_flight`), die vervolgens een Next.js API route aanroept (`/api/schiphol`), die de Schiphol live flight data ophaalt. Dit wordt ook wel "Tool-Augmented AI Agent" genoemd.

### iOS swipe-back sessie cleanup
`useEffect` cleanup met `useRef` om stale closures te voorkomen — `conversation.endSession()` wordt aangeroepen bij unmount, ook bij iOS swipe-back.

---

## Functies geïmplementeerd

- **Taal selectie** — 10 talen (alfabetisch, Engels eerst): EN, AR, ZH, NL, FR, HI, JA, PT, ES, TR
- **Flagship language selector** — verticale lijst, Playfair Display serif, vlag als accent, Engelse sublabel
- **Visuele selectiefeedback** — taal dikgedrukt + bolletje rechts voor 500ms bij aanklikken, dan navigatie
- **Voice orb** — pulseringen bij AI spreekt, ademhaling bij luisteren, soundwave bars
- **Live vluchtdata** — Schiphol API via client tool, met walking time berekening
- **Warning overlays** — bus gate, departing soon, inbound flight — met afteltimer en redirect
- **Satisfactiemodal** — 5-punt emoji schaal, afteltimer, skip optie
- **Transcript** — auto-scroll, ElevenLabs expression tags (`[calm]`, `[encourage]` etc.) gefilterd
- **Inactivity timer** — 60s zonder gesprek → redirect home
- **Warning backdrop click** — klikken naast warning modal → terug naar home

---

## Openstaande punten / backlog

- [ ] `ELEVENLABS_AGENT_EN` instellen in Vercel (vervangt alle `ELEVENLABS_AGENT_*` vars)
- [ ] Testen of language override correct werkt voor alle 10 talen
- [ ] Openingszinnen per taal verfijnen op basis van taalanalyse (zie notities hieronder)
- [ ] Auto-start gesprek bij vlag-tap overwegen (iOS kiosk, microfoon reeds granted)

---

## Taalanalyse openingszinnen

Analyse van de gegenereerde openingszinnen per taal — gemeenschappelijk patroon: template-vertaling met "today"-redundantie en dubbele herhaling van vluchtnummer.

| Taal | Ernst | Voornaamste issue |
|------|-------|-------------------|
| Japans | ⚠️⚠️ | `あなた` is onbeleefd in servicecontext → `お客様` |
| Portugees | ⚠️ | Braziliaans Portugees (`você`, `me dizer`) i.p.v. Europees |
| Mandarijn | ⚠️ | `你好` vs `您` inconsistentie → `您好` |
| Arabisch | Licht | Dubbele begroeting `مرحبًا، مرحبًا بك` |
| Frans | Licht | `aujourd'hui` redundant, vluchtnummer herhaald |
| Hindi | Licht | `आपका`/`अपना` inconsistentie |
| Turks | Minimaal | `bilmek istiyorum` iets te direct |

**Universele verbeteringen voor alle talen:**
1. "vandaag/today" weglaten — impliciet
2. Vluchtnummer niet twee keer noemen — tweede keer vervangen door pronomen
3. Directe verklaring ("ik wil weten") vervangen door beleefde vraagvorm
