// ─── Types ────────────────────────────────────────────────────────────────────

export interface FlightData {
  airline: string
  flightName: string
  gate: string
  flightDirection: string
  startCheckInTime: string
  latestCheckInTime: string
  checkInDesk: string
  scheduleDateTime: string
  scheduleDate: string
  scheduleTime: string
  aircraftType: string
  expectedTimeBoarding: string
  expectedTimeGateClosing: string
  expectedTimeGateOpen: string
  terminal: string
  destination: string
  destinationCode: string
}

export type FlightWarning = "bus_gate" | "departing_soon" | "inbound_flight"

// ─── Flight number normalisation ──────────────────────────────────────────────

/**
 * Normalises a raw flight number string (typed or from speech-to-text) into
 * the IATA/ICAO format expected by the Schiphol API.
 *
 * Handles:
 *  - Whitespace removal and uppercasing
 *  - 2-letter IATA codes (e.g. KL) → minimum 3 digits
 *  - 3-letter ICAO codes (e.g. KLM) → minimum 2 digits
 */
export function formatFlightNumber(input: string): { formatted: string; isValid: boolean } {
  const cleaned = input.replace(/\s/g, "").toUpperCase()

  // 3-letter ICAO prefix
  const match3 = cleaned.match(/^([A-Z]{3})(\d+)$/)
  if (match3) {
    const [, letters, numbers] = match3
    if (numbers.length >= 1 && numbers.length <= 4) {
      return { formatted: letters + numbers.padStart(Math.max(2, numbers.length), "0"), isValid: true }
    }
  }

  // 2-letter IATA prefix
  const match2 = cleaned.match(/^([A-Z]{2})(\d+)$/)
  if (match2) {
    const [, letters, numbers] = match2
    if (numbers.length >= 1 && numbers.length <= 4) {
      return { formatted: letters + numbers.padStart(Math.max(3, numbers.length), "0"), isValid: true }
    }
  }

  return { formatted: cleaned, isValid: false }
}

/**
 * Returns alternative flight number formats to try if the primary lookup fails.
 * Handles leading-zero variations (e.g. KL123 ↔ KL0123).
 */
export function getAlternativeFormats(flightNumber: string): string[] {
  const alternatives: string[] = []
  const match = flightNumber.match(/^([A-Z]{2,3})(\d+)$/)
  if (!match) return alternatives

  const [, letters, numbers] = match
  const minDigits = letters.length === 2 ? 3 : 2

  if (numbers.length < 4) {
    alternatives.push(letters + "0" + numbers)
  }

  if (numbers.startsWith("0") && numbers.length > 1) {
    const stripped = numbers.replace(/^0/, "")
    if (stripped.length >= minDigits) {
      alternatives.push(letters + stripped)
    } else {
      alternatives.push(letters + stripped.padStart(minDigits, "0"))
    }
  }

  return alternatives
}

// ─── Warning detection ────────────────────────────────────────────────────────

/**
 * Returns true if the given Schiphol gate code requires a bus transfer.
 * Based on the official Schiphol bus-gate list.
 */
export function isBusGate(gate: string): boolean {
  if (!gate) return false
  const g = gate.toUpperCase()
  return (
    /^B(0[1-8]|1[6-9]|[23]\d|3[0-6])$/.test(g) ||
    /^C2[1-4]$/.test(g) ||
    /^D(06|42)$/.test(g) ||
    g === "E21" ||
    g === "G1" ||
    /^H[1-7]$/.test(g) ||
    /^M[1-7]$/.test(g)
  )
}

/**
 * Returns true if the flight departs within the next 60 minutes.
 */
export function isDepartingSoon(scheduleDateTime: string): boolean {
  if (!scheduleDateTime) return false
  try {
    const diffMs = new Date(scheduleDateTime).getTime() - Date.now()
    const diffMin = diffMs / 60_000
    return diffMin > 0 && diffMin < 60
  } catch {
    return false
  }
}

export function formatTimeForDisplay(scheduleDateTime: string): string {
  if (!scheduleDateTime) return ""
  try {
    const d = new Date(scheduleDateTime)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  } catch {
    return ""
  }
}

// ─── Walking time estimate ────────────────────────────────────────────────────

const WALKING_TIMES: Record<string, { distanceM: string; minutes: string }> = {
  B: { distanceM: "600-700",   minutes: "7-8"   },
  C: { distanceM: "400-500",   minutes: "5-6"   },
  D: { distanceM: "1500-1600", minutes: "15-16" },
  E: { distanceM: "1200-1400", minutes: "12-14" },
  F: { distanceM: "1000-1200", minutes: "10-15" },
  G: { distanceM: "1100-1500", minutes: "11-15" },
  H: { distanceM: "2000-2400", minutes: "20-24" },
  M: { distanceM: "2000-2400", minutes: "20-24" },
}

/**
 * Returns a walking time estimate for a given Schiphol gate code.
 * Extracts the gate letter (e.g. "D" from "D81") and looks up the reference data.
 * Returns null if the gate letter is not recognised.
 */
export function getWalkingTime(gate: string): { distanceM: string; minutes: string; summary: string } | null {
  if (!gate) return null
  const letter = gate.trim().toUpperCase().charAt(0)
  const entry = WALKING_TIMES[letter]
  if (!entry) return null
  return {
    ...entry,
    summary: `approximately ${entry.distanceM} meters, which usually takes ${entry.minutes} minutes`,
  }
}

/**
 * Derives the set of warnings applicable to a flight based on the Schiphol response.
 */
export function computeWarnings(data: FlightData): FlightWarning[] {
  // inbound_flight is always standalone — wrong flight number entered entirely
  if (data.flightDirection && data.flightDirection !== "D") {
    return ["inbound_flight"]
  }

  // departing_soon supersedes bus_gate — urgency is already at maximum
  if (data.scheduleDateTime && isDepartingSoon(data.scheduleDateTime)) {
    return ["departing_soon"]
  }

  if (data.gate && isBusGate(data.gate)) {
    return ["bus_gate"]
  }

  return []
}
