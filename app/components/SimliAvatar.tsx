'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { generateSimliSessionToken, LogLevel, SimliClient } from 'simli-client';
import { getElevenLabsSignedUrl } from '../actions/actions';

interface SimliAvatarProps {
  faceId: string;
  agentId: string;
}

type ElevenLabsWebSocketEvent =
  | { type: 'user_transcript'; user_transcription_event: { user_transcript: string } }
  | { type: 'agent_response'; agent_response_event: { agent_response: string } }
  | { type: 'audio'; audio_event: { audio_base_64: string; event_id: number } }
  | { type: 'interruption'; interruption_event: { reason: string } }
  | { type: 'ping'; ping_event: { event_id: number; ping_ms?: number } };

let simliClient: SimliClient | null = null;

export default function SimliAvatar({ faceId, agentId }: SimliAvatarProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const base64ToUint8Array = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const float32ToBase64PCM = (float32Array: Float32Array): string => {
    const pcmArray = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      pcmArray[i] = Math.floor(clamped * 32767);
    }
    const uint8Array = new Uint8Array(pcmArray.buffer);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binaryString += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)));
    }
    return btoa(binaryString);
  };

  const setupVoiceStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    let isProcessing = false;
    processor.onaudioprocess = (event) => {
      if (isProcessing || websocketRef.current?.readyState !== WebSocket.OPEN) return;
      isProcessing = true;
      try {
        const inputData = event.inputBuffer.getChannelData(0);
        if (inputData.some(s => Math.abs(s) > 0.01)) {
          websocketRef.current?.send(JSON.stringify({ user_audio_chunk: float32ToBase64PCM(inputData) }));
        }
      } finally {
        isProcessing = false;
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  };

  const stopVoiceStream = () => {
    processorRef.current?.disconnect();
    if (processorRef.current) processorRef.current.onaudioprocess = null;
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const connectToElevenLabs = async () => {
    const signedUrl = await getElevenLabsSignedUrl(agentId);
    const websocket = new WebSocket(signedUrl);
    websocketRef.current = websocket;

    websocket.onopen = async () => {
      websocket.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_initiation_client_data: { custom_llm_extra_body: {} },
      }));
      simliClient?.ClearBuffer();
      await setupVoiceStream();
      setIsActive(true);
      setIsLoading(false);
    };

    websocket.onmessage = async (event) => {
      const data = JSON.parse(event.data) as ElevenLabsWebSocketEvent;

      if (data.type === 'ping') {
        setTimeout(() => {
          websocket.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.event_id }));
        }, data.ping_event.ping_ms ?? 0);
      }

      if (data.type === 'audio') {
        simliClient?.sendAudioData(base64ToUint8Array(data.audio_event.audio_base_64));
      }

      if (data.type === 'interruption') {
        simliClient?.ClearBuffer();
      }
    };

    websocket.onclose = () => {
      setIsActive(false);
      stopVoiceStream();
      handleStop();
      websocketRef.current = null;
    };

    websocket.onerror = () => {
      setError('Verbinding mislukt');
      setIsLoading(false);
    };
  };

  const initializeSimliClient = useCallback(async () => {
    if (!videoRef.current || !audioRef.current) return;

    const sessionToken = (await generateSimliSessionToken({
      apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY as string,
      config: { faceId, maxIdleTime: 600, maxSessionLength: 600, handleSilence: true },
    })).session_token;

    simliClient = new SimliClient(sessionToken, videoRef.current, audioRef.current, null, LogLevel.ERROR, 'livekit');

    simliClient.on('start', () => {
      simliClient?.sendAudioData(new Uint8Array(6000).fill(0));
      connectToElevenLabs();
    });

    simliClient.on('startup_error', () => {
      setError('Avatar kon niet starten — controleer je Simli Face ID');
      setIsLoading(false);
    });

    await simliClient.start();
  }, [faceId]);

  const handleStart = useCallback(async () => {
    setIsLoading(true);
    setError('');
    await initializeSimliClient();
  }, [initializeSimliClient]);

  const handleStop = useCallback(() => {
    setIsLoading(false);
    setIsActive(false);
    setError('');
    websocketRef.current?.close();
    websocketRef.current = null;
    stopVoiceStream();
    simliClient?.stop();
    simliClient = null;
  }, []);

  useEffect(() => {
    return () => {
      websocketRef.current?.close();
      stopVoiceStream();
      simliClient?.stop();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Video */}
      <div className="relative w-[350px] h-[350px] rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <audio ref={audioRef} autoPlay />
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            {isLoading ? (
              <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20" />
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-sm text-center max-w-xs">{error}</p>
      )}

      {/* Controls */}
      {!isActive ? (
        <button
          onClick={handleStart}
          disabled={isLoading}
          className="px-8 py-3 bg-white text-black font-semibold rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
        >
          {isLoading ? 'Verbinden...' : 'Start gesprek'}
        </button>
      ) : (
        <button
          onClick={handleStop}
          className="px-8 py-3 bg-red-500 text-white font-semibold rounded-full hover:bg-red-600 transition-colors"
        >
          Stop gesprek
        </button>
      )}
    </div>
  );
}
