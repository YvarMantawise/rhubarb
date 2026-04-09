import { NextResponse } from "next/server"
import {
  formatFlightNumber,
  getAlternativeFormats,
  computeWarnings,
  getWalkingTime,
  type FlightData,
} from "@/lib/flight-utils"

const WARNING_MESSAGES: Record<string, string> = {
  bus_gate:
    "The passenger's gate is a BUS GATE. They must take a bus from the terminal to the aircraft. Please warn them clearly and advise them to allow extra travel time to reach the gate.",
  departing_soon:
    "The flight is DEPARTING SOON (within 60 minutes). Please urgently advise the passenger to proceed to their gate immediately — there is no time to spare.",
  inbound_flight:
    "This appears to be an ARRIVING (inbound) flight, not a departure. Please check whether the passenger has given the correct flight number.",
}

// ElevenLabs calls this endpoint when the agent uses the lookup_flight tool
// via a server-side webhook. The request body contains the tool parameters.
export async function POST(request: Request) {
  try {
    const body = await request.json() as { parameters?: { flight_number?: string }; flight_number?: string }

    // ElevenLabs wraps parameters in a "parameters" key, but support both shapes
    const flightNumber = body.parameters?.flight_number ?? body.flight_number

    if (!flightNumber) {
      return NextResponse.json({ error: "flight_number is required" }, { status: 400 })
    }

    const { formatted, isValid } = formatFlightNumber(flightNumber)
    if (!isValid) {
      return NextResponse.json({ error: "Invalid flight number format" })
    }

    // Try primary format, then alternatives (handles leading-zero variations)
    let data: FlightData | null = null
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

    for (const candidate of [formatted, ...getAlternativeFormats(formatted)]) {
      const res = await fetch(`${baseUrl}/api/schiphol?flightname=${candidate}`)
      if (res.ok) {
        const json = await res.json() as FlightData & { error?: string }
        if (!json.error) {
          data = json
          break
        }
      }
    }

    if (!data) {
      return NextResponse.json({ error: "Flight not found" })
    }

    const flightWarnings = computeWarnings(data)

    return NextResponse.json({
      ...data,
      active_warnings: flightWarnings,
      warning_instructions: flightWarnings.map(w => WARNING_MESSAGES[w]),
      walking_time: getWalkingTime(data.gate),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("lookup-flight webhook error:", message)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
