import { NextResponse } from "next/server"

export async function POST(request: Request) {
  console.log("=== SATISFACTION RATING API START ===")
  console.log("Request URL:", request.url)
  console.log("Timestamp:", new Date().toISOString())
  
  try {
    const body = await request.json()
    const { rating, language, flightInfo, sessionId } = body
    
    console.log("Received satisfaction data:", {
      rating,
      language,
      flightInfo: flightInfo ? "Present" : "Missing",
      sessionId: sessionId || "Missing",
    })

    // Prepare payload for Make.com webhook
    const payload = {
      rating: rating,
      language: language,
      sessionId: sessionId || "",
      timestamp: new Date().toISOString(),
      flightInfo: {
        flightName: flightInfo?.flightName || "",
        gate: flightInfo?.gate || "",
        destination: flightInfo?.destination || "",
        scheduleTime: flightInfo?.scheduleTime || "",
        terminal: flightInfo?.terminal || "",
      }
    }

    console.log("Sending payload to webhook:", payload)

    // Get webhook URL and API key from environment variables
    const webhookUrl = process.env.SATISFACTION_WEBHOOK_URL
    const makeApiKey = process.env.MAKE_FEEDBACK_WEBHOOK_API_KEY

    if (!webhookUrl) {
      throw new Error('SATISFACTION_WEBHOOK_URL environment variable is not set')
    }

    if (!makeApiKey) {
      throw new Error('MAKE_FEEDBACK_WEBHOOK_API_KEY environment variable is not set')
    }

    // Send to Make.com webhook WITH the API key (server-side only)
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-make-apikey': makeApiKey,
      },
      body: JSON.stringify(payload),
    })

    console.log("Webhook response status:", webhookResponse.status)

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text()
      console.error("Webhook error:", errorText)
      throw new Error(`Webhook error: ${webhookResponse.status}`)
    }

    console.log("Satisfaction rating sent successfully")

    return NextResponse.json({
      success: true,
      message: "Rating submitted successfully",
      timestamp: new Date().toISOString(),
    })

  } catch (error: any) {
    console.error("=== SATISFACTION RATING ERROR ===")
    console.error("Error type:", error.constructor.name)
    console.error("Error message:", error.message)
    console.error("Error stack:", error.stack)
    
    return NextResponse.json({ 
      success: false,
      error: "Failed to submit satisfaction rating",
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
