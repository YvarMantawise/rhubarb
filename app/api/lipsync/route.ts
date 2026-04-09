import { NextResponse } from "next/server"
import { Rhubarb } from "rhubarb-lip-sync-wasm"

export async function POST(request: Request) {
  try {
    const arrayBuffer = await request.arrayBuffer()
    const pcmBuffer = Buffer.from(arrayBuffer)
    const result = await Rhubarb.getLipSync(pcmBuffer)
    return NextResponse.json({ mouthCues: result.mouthCues })
  } catch (error) {
    console.error("[lipsync] error:", error)
    return NextResponse.json({ mouthCues: [] }, { status: 500 })
  }
}
