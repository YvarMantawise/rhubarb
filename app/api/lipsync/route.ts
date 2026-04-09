import { NextResponse } from "next/server"
import { Rhubarb } from "rhubarb-lip-sync-wasm"

export async function POST(request: Request) {
  try {
    const arrayBuffer = await request.arrayBuffer()
    const pcmBuffer = Buffer.from(arrayBuffer)
    const result = await Rhubarb.getLipSync(pcmBuffer)
    return NextResponse.json({ mouthCues: result.mouthCues })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[lipsync] error:", message)
    return NextResponse.json({ mouthCues: [] }, { status: 500 })
  }
}
