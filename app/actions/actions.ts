'use server';

export async function getElevenLabsSignedUrl(agentId: string): Promise<string> {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
    {
      method: 'GET',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
    }
  );

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status}`);
  }

  const body = await response.json() as { signed_url: string };
  return body.signed_url;
}
