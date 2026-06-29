"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Clock3, Loader2, Mic, MicOff, PhoneOff, Radio, Send, ShieldCheck, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dayzaFetch } from "@/lib/firebase-session-client";

type LiveStatus = "idle" | "starting" | "listening" | "thinking" | "speaking" | "ended" | "error";
type TranscriptRole = "user" | "assistant" | "system" | "tool";

type TranscriptItem = {
  id: string;
  role: TranscriptRole;
  text: string;
  streaming?: boolean;
};

type LiveTokenResponse = {
  token: string;
  model: string;
  setup: Record<string, unknown>;
  maxSessionSeconds: number;
};

type DayzaLiveAgentProps = {
  title?: string;
  subtitle?: string;
  initialSystemMessage?: string;
  tokenPayload?: Record<string, unknown>;
  toolEndpoint?: string;
  className?: string;
  compact?: boolean;
  onTranscript?: (item: { role: TranscriptRole; text: string }) => void;
};

const LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clampSample(sample: number) {
  return Math.max(-1, Math.min(1, sample));
}

function float32ToBase64Pcm(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = clampSample(samples[i]);
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pcm = new Int16Array(bytes.buffer);
  const output = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) output[i] = pcm[i] / 0x8000;
  return output;
}

async function readSocketMessage(data: MessageEvent["data"]) {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data ?? "");
}

async function readResponseJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 240) };
  }
}

function statusLabel(status: LiveStatus) {
  if (status === "starting") return "Starting";
  if (status === "listening") return "Listening";
  if (status === "thinking") return "Thinking";
  if (status === "speaking") return "Speaking";
  if (status === "error") return "Needs attention";
  if (status === "ended") return "Ended";
  return "Ready";
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function DayzaLiveAgent({
  title = "Live Dayza",
  subtitle = "Voice-first agent with confirmation before app changes. No raw audio is stored.",
  initialSystemMessage = "Tap Start Live and talk to Dayza. Reads are instant; app changes require confirmation.",
  tokenPayload,
  toolEndpoint = "/api/live/tool",
  className = "",
  compact = false,
  onTranscript,
}: DayzaLiveAgentProps = {}) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState("");
  const [liveError, setLiveError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [maxSessionSeconds, setMaxSessionSeconds] = useState(600);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([
    {
      id: uid(),
      role: "system",
      text: initialSystemMessage,
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const maxSessionRef = useRef(600);
  const mutedRef = useRef(false);
  const stoppingRef = useRef(false);
  const interruptingRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const pushTranscript = useCallback((role: TranscriptRole, nextText: string) => {
    const clean = String(nextText || "").trim();
    if (!clean) return;
    onTranscript?.({ role, text: clean });
    setTranscript((items) => [...items.slice(-40), { id: uid(), role, text: clean }]);
  }, [onTranscript]);

  const showLiveError = useCallback((message: string) => {
    const clean = String(message || "Live Agent had a problem. Use typed chat below.").trim();
    setLiveError(clean);
    setStatus("error");
    toast.error(clean);
    pushTranscript("system", clean);
  }, [pushTranscript]);

  const updateStreamingTranscript = useCallback((role: "user" | "assistant", nextText: string) => {
    const clean = String(nextText || "").trim();
    if (!clean) return;
    setTranscript((items) => {
      const last = items[items.length - 1];
      if (last?.role === role && last.streaming) {
        return [...items.slice(0, -1), { ...last, text: clean }];
      }
      return [...items.slice(-40), { id: uid(), role, text: clean, streaming: true }];
    });
  }, []);

  const finishStreamingTranscript = useCallback(() => {
    setTranscript((items) => items.map((item) => (item.streaming ? { ...item, streaming: false } : item)));
  }, []);

  const sendJson = useCallback((payload: unknown) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const interruptPlayback = useCallback(() => {
    interruptingRef.current = true;
    playbackNodeRef.current?.port.postMessage("interrupt");
    playbackContextRef.current?.suspend().catch(() => undefined);
    sendJson({ realtimeInput: { activityStart: {} } });
    window.setTimeout(() => {
      playbackContextRef.current?.resume().catch(() => undefined);
    }, 250);
    setStatus("listening");
    finishStreamingTranscript();
    pushTranscript("system", "Stopped speaking. I am listening.");
  }, [finishStreamingTranscript, pushTranscript, sendJson]);

  const stopLive = useCallback((reason = "Live session ended.") => {
    stoppingRef.current = true;
    interruptingRef.current = true;
    setStatus("ended");
    setElapsedSeconds(0);
    pushTranscript("system", reason);

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const socket = wsRef.current;
    wsRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, "User ended Live Dayza");
      }
    }
    playbackNodeRef.current?.port.postMessage("interrupt");
    captureNodeRef.current?.disconnect();
    captureNodeRef.current = null;
    playbackNodeRef.current?.disconnect();
    playbackNodeRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    captureContextRef.current?.close().catch(() => undefined);
    playbackContextRef.current?.close().catch(() => undefined);
    captureContextRef.current = null;
    playbackContextRef.current = null;
    startedAtRef.current = null;
    window.setTimeout(() => {
      stoppingRef.current = false;
      interruptingRef.current = false;
    }, 250);
  }, [pushTranscript]);

  useEffect(() => {
    return () => {
      stopLive("Live session closed.");
    };
  }, [stopLive]);

  const setupPlayback = useCallback(async () => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) throw new Error("Audio playback is not supported in this browser.");

    const context = new AudioContextClass({ sampleRate: 24000 });
    await context.audioWorklet.addModule("/audio-processors/playback.worklet.js");
    const node = new AudioWorkletNode(context, "pcm-processor");
    node.connect(context.destination);
    await context.resume();
    playbackContextRef.current = context;
    playbackNodeRef.current = node;
  }, []);

  const startMicrophone = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone is not available in this browser.");
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) throw new Error("Audio capture is not supported in this browser.");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });
    const context = new AudioContextClass({ sampleRate: 16000 });
    await context.audioWorklet.addModule("/audio-processors/capture.worklet.js");

    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "audio-capture-processor");
    const zeroGain = context.createGain();
    zeroGain.gain.value = 0;

    node.port.onmessage = (event) => {
      if (mutedRef.current || event.data?.type !== "audio") return;
      const data = float32ToBase64Pcm(event.data.data);
      sendJson({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data,
          },
        },
      });
    };

    source.connect(node);
    node.connect(zeroGain);
    zeroGain.connect(context.destination);
    await context.resume();

    micStreamRef.current = stream;
    captureContextRef.current = context;
    captureNodeRef.current = node;
    setStatus("listening");
    pushTranscript("system", "Live mic is on. Speak naturally; use End call when done.");
  }, [pushTranscript, sendJson]);

  const handleToolCalls = useCallback(async (functionCalls: any[]) => {
    if (!Array.isArray(functionCalls) || functionCalls.length === 0) return;
    setStatus("thinking");
    pushTranscript("tool", `Using ${functionCalls.length === 1 ? functionCalls[0]?.name : `${functionCalls.length} Dayza tools`}...`);

    const functionResponses = await Promise.all(
      functionCalls.map(async (call) => {
        try {
          const res = await dayzaFetch(toolEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: call?.name, args: call?.args ?? {} }),
          });
          const data = await readResponseJson(res);
          if (!res.ok) pushTranscript("tool", `Tool failed: ${data?.error ?? "Could not complete action"}`);
          return {
            id: call?.id,
            name: call?.name,
            response: res.ok ? data?.result ?? { ok: true } : { ok: false, error: data?.error ?? "Tool failed" },
          };
        } catch (error: any) {
          pushTranscript("tool", `Tool failed: ${error?.message ?? "Could not complete action"}`);
          return {
            id: call?.id,
            name: call?.name,
            response: { ok: false, error: error?.message ?? "Tool failed" },
          };
        }
      })
    );

    sendJson({ toolResponse: { functionResponses } });
  }, [pushTranscript, sendJson, toolEndpoint]);

  const handleLiveMessage = useCallback((message: any) => {
    if (message?.error) {
      const detail = message.error?.message || message.error?.status || "Live Dayza returned an error.";
      showLiveError(`Live Dayza error: ${detail}`);
      return;
    }

    if (message?.setupComplete) {
      void startMicrophone().catch((error) => {
        showLiveError(error instanceof Error ? `Microphone failed: ${error.message}` : "Microphone failed. Use the typed chat fallback below.");
      });
      return;
    }

    if (message?.toolCall?.functionCalls) {
      void handleToolCalls(message.toolCall.functionCalls);
    }

    const serverContent = message?.serverContent;
    if (!serverContent) return;

    if (serverContent?.interrupted) {
      playbackNodeRef.current?.port.postMessage("interrupt");
      interruptingRef.current = false;
      setStatus("listening");
    }

    if (serverContent?.inputTranscription?.text) {
      updateStreamingTranscript("user", serverContent.inputTranscription.text);
    }

    if (serverContent?.outputTranscription?.text) {
      updateStreamingTranscript("assistant", serverContent.outputTranscription.text);
    }

    const parts = serverContent?.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part?.text) updateStreamingTranscript("assistant", part.text);
        const inlineData = part?.inlineData;
        if (inlineData?.data && String(inlineData?.mimeType || "").startsWith("audio/")) {
          if (interruptingRef.current) continue;
          setStatus("speaking");
          const audio = base64PcmToFloat32(inlineData.data);
          playbackNodeRef.current?.port.postMessage(audio, [audio.buffer]);
        }
      }
    }

    if (serverContent?.turnComplete) {
      interruptingRef.current = false;
      finishStreamingTranscript();
      setStatus("listening");
    }
  }, [finishStreamingTranscript, handleToolCalls, pushTranscript, showLiveError, startMicrophone, updateStreamingTranscript]);

  const startLive = useCallback(async () => {
    if (status === "starting" || status === "listening" || status === "speaking" || status === "thinking") return;

    try {
      setStatus("starting");
      setLiveError("");
      setTranscript([{ id: uid(), role: "system", text: "Starting secure Live Agent session..." }]);

      const tokenRes = await dayzaFetch("/api/live/token", {
        method: "POST",
        headers: tokenPayload ? { "Content-Type": "application/json" } : undefined,
        body: tokenPayload ? JSON.stringify(tokenPayload) : undefined,
      });
      const tokenData = (await readResponseJson(tokenRes)) as Partial<LiveTokenResponse> & { error?: string };
      if (!tokenRes.ok || !tokenData.token || !tokenData.setup) {
        throw new Error(tokenData?.error ? `Live setup failed: ${tokenData.error}` : "Live setup failed. Use typed chat below.");
      }

      await setupPlayback();

      const sessionLimit = Math.max(60, Math.min(20 * 60, Number(tokenData.maxSessionSeconds || 600)));
      maxSessionRef.current = sessionLimit;
      setMaxSessionSeconds(sessionLimit);
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => {
        if (!startedAtRef.current) return;
        const next = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(next);
        if (next >= maxSessionRef.current) stopLive("Live session ended because the session time limit was reached.");
      }, 1000);

      const socket = new WebSocket(`${LIVE_WS_URL}?access_token=${encodeURIComponent(tokenData.token)}`);
      wsRef.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ setup: tokenData.setup }));
        pushTranscript("system", "Connected to Live Dayza.");
      };
      socket.onmessage = async (event) => {
        try {
          const messageText = await readSocketMessage(event.data);
          handleLiveMessage(JSON.parse(messageText));
        } catch (error) {
          console.error("Gemini Live message parse failed", error);
          showLiveError("Could not read a Gemini Live response. Please end the call and start again.");
        }
      };
      socket.onerror = () => {
        showLiveError("Live Agent connection failed. Typed chat still works below.");
      };
      socket.onclose = (event) => {
        if (!stoppingRef.current && status !== "idle") {
          setStatus("ended");
          const closeReason = event.reason ? ` Reason: ${event.reason}` : "";
          pushTranscript("system", `Live connection closed${event.code ? ` (${event.code})` : ""}.${closeReason}`);
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start Live Agent";
      showLiveError(message);
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      captureContextRef.current?.close().catch(() => undefined);
      playbackContextRef.current?.close().catch(() => undefined);
    }
  }, [handleLiveMessage, pushTranscript, setupPlayback, showLiveError, status, stopLive, tokenPayload]);

  const sendText = useCallback(() => {
    const clean = text.trim();
    if (!clean) return;
    if (!sendJson({ clientContent: { turns: [{ role: "user", parts: [{ text: clean }] }], turnComplete: true } })) {
      pushTranscript("system", "Start Live Agent first, or use the full typed chat below.");
      return;
    }
    pushTranscript("user", clean);
    setText("");
    setStatus("thinking");
  }, [pushTranscript, sendJson, text]);

  const liveActive = status === "starting" || status === "listening" || status === "speaking" || status === "thinking";
  const progress = Math.min(100, Math.round((elapsedSeconds / maxSessionSeconds) * 100));

  return (
    <Card className={`mb-3 overflow-hidden rounded-2xl border-primary/20 bg-gradient-to-b from-primary/10 via-card to-card sm:mb-4 ${className}`}>
      <div className="border-b border-border/70 px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/70 px-2 py-1 text-[0.7rem] font-semibold text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {formatTimer(elapsedSeconds)}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        {liveError && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
            {liveError}
          </div>
        )}
      </div>

      <div className={`grid gap-3 p-3 sm:p-4 ${compact ? "" : "lg:grid-cols-[16rem_minmax(0,1fr)]"}`}>
        <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
          <button
            type="button"
            onClick={liveActive ? () => stopLive("Live call ended by user.") : startLive}
            className={`group flex aspect-square w-full flex-col items-center justify-center rounded-[2rem] border text-center transition active:scale-[0.98] ${
              liveActive
                ? "border-destructive/35 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20"
            }`}
          >
            <span className={`mb-4 flex h-20 w-20 items-center justify-center rounded-full ${liveActive ? "bg-destructive/15" : "bg-primary text-primary-foreground"}`}>
              {status === "starting" ? <Loader2 className="h-8 w-8 animate-spin" /> : liveActive ? <PhoneOff className="h-8 w-8" /> : <Radio className="h-8 w-8" />}
            </span>
            <span className="text-xl font-bold">{liveActive ? "End Call" : "Start Live"}</span>
            <span className="mt-1 text-xs text-muted-foreground">{statusLabel(status)}</span>
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={muted ? "default" : "outline"}
              className="h-11 rounded-xl"
              onClick={() => setMuted((value) => !value)}
              disabled={!liveActive}
            >
              {muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {muted ? "Muted" : "Mic"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
              onClick={interruptPlayback}
              disabled={!liveActive}
            >
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          </div>
          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-200">
            <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
            Reads run directly. Logging spends, food, water, reminders, and workouts needs your confirmation.
          </div>
        </div>

        <div className="flex min-h-[18rem] flex-col overflow-hidden rounded-2xl border border-border/80 bg-background/60">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Conversation
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
              status === "error" ? "bg-destructive/15 text-destructive" : liveActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              {statusLabel(status)}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3">
            {transcript.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  item.role === "user"
                    ? "ml-auto max-w-[86%] bg-primary text-primary-foreground"
                    : item.role === "assistant"
                      ? "max-w-[90%] bg-muted text-foreground"
                      : item.role === "tool"
                        ? "max-w-[90%] border border-primary/20 bg-primary/10 text-primary"
                        : "max-w-[95%] border border-border bg-background/70 text-muted-foreground"
                }`}
              >
                {item.text}
                {item.streaming && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current align-middle" />}
              </div>
            ))}
          </div>

          <form
            className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2 border-t border-border p-2"
            onSubmit={(event) => {
              event.preventDefault();
              sendText();
            }}
          >
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={liveActive ? "Type fallback message..." : "Start Live, or use chat below..."}
              className="h-11 rounded-xl"
            />
            <Button type="submit" className="h-11 rounded-xl px-0" disabled={!text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </Card>
  );
}
