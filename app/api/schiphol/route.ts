import { NextResponse } from "next/server"
import { getAirportName } from "@/lib/airport-codes"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const flightName = searchParams.get("flightname")

  if (!flightName) {
    return NextResponse.json({ error: "Flight name is required" }, { status: 400 })
  }

  try {
    // Call actual Schiphol API
    const response = await fetch(`https://api.schiphol.nl/public-flights/flights?flightname=${flightName}`, {
      headers: {
        'ResourceVersion': 'v4',
        'app_id': process.env.SCHIPHOL_APP_ID!,
        'app_key': process.env.SCHIPHOL_APP_KEY!,
        'Accept': 'application/json',
      }
    })

    if (!response.ok) {
      console.error("Schiphol API error:", response.status, response.statusText)
      throw new Error(`Schiphol API error: ${response.status}`)
    }

    const data = await response.json()
    
    // Check if flights were found
    if (!data.flights || data.flights.length === 0) {
      return NextResponse.json({ 
        error: "Flight not found",
        flightName,
      }, { status: 404 })
    }

    // Get the first flight (assuming single result or we want the first match)
    const flight = data.flights[0]

    // Get the destination IATA code from the existing API response
    const destinationCode = flight.route?.destinations?.[0] || ""
    
    // Convert IATA code to full airport name
    const destinationName = getAirportName(destinationCode)

    // Extract and format the required information
    const flightData = {
      airline: String(flight.prefixIATA || ""), // e.g., "UX"
      flightName: String(flight.flightName || flightName), // e.g., "UX1094"
      gate: String(flight.gate || ""), // e.g., "D81"
      flightDirection: String(flight.flightDirection || ""), // "D" or "A"
      
      // Check-in information
      startCheckInTime: String(flight.checkinAllocations?.checkinAllocations?.[0]?.startTime || ""),
      latestCheckInTime: String(flight.checkinAllocations?.checkinAllocations?.[0]?.endTime || ""),
      checkInDesk: String(flight.checkinAllocations?.checkinAllocations?.[0]?.rows?.rows?.[0]?.position || ""),
      
      // Schedule information
      scheduleDateTime: String(flight.scheduleDateTime || ""),
      scheduleDate: String(flight.scheduleDate || ""),
      scheduleTime: String(flight.scheduleTime || ""),
      
      // Aircraft information
      aircraftType: String(flight.aircraftType?.iataMain || ""),
      
      // Gate timing information
      expectedTimeBoarding: String(flight.expectedTimeBoarding || ""),
      expectedTimeGateClosing: String(flight.expectedTimeGateClosing || ""),
      expectedTimeGateOpen: String(flight.expectedTimeGateOpen || ""),
      
      // Additional useful info (UPDATED - now includes both formats)
      terminal: String(flight.terminal || ""),
      destination: destinationName,           // NEW: Full airport name (e.g., "Singapore Changi Airport")
      destinationCode: destinationCode,       // NEW: IATA code (e.g., "SIN") - for reference if needed
    }

    return NextResponse.json(flightData)
    
  } catch (error) {
    console.error("Error fetching flight data:", error)
    return NextResponse.json({ 
      error: "Failed to fetch flight information",
      flightName,
    }, { status: 500 })
  }
}
