import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { language?: string }
    const { language = "en" } = body

    // Single English agent — language is overridden client-side via conversation overrides
    const agentId = process.env.ELEVENLABS_AGENT_EN ?? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_EN
    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "ELEVENLABS_AGENT_EN is not configured" },
        { status: 500 }
      )
    }

    const usePublicAgent = process.env.USE_PUBLIC_AGENT === "true"

    if (usePublicAgent) {
      return NextResponse.json({
        success: true,
        sessionType: "public",
        agentId,
        language,
      })
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { success: false, error: "ELEVENLABS_API_KEY is not configured" },
        { status: 500 }
      )
    }

    const signedUrlResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    )

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text()
      console.error("ElevenLabs signed URL error:", signedUrlResponse.status, errorText)
      return NextResponse.json(
        { success: false, error: `ElevenLabs API error: ${signedUrlResponse.status}` },
        { status: 502 }
      )
    }

    const { signed_url } = await signedUrlResponse.json() as { signed_url: string }

    return NextResponse.json({
      success: true,
      sessionType: "private",
      signedUrl: signed_url,
      language,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("create-session error:", message)
    return NextResponse.json(
      { success: false, error: "Failed to create ElevenLabs session", details: message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "/api/elevenlabs/create-session" })
}
