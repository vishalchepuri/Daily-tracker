"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ImagePlus, Send, Bot, User, Loader2, X, Mic, MicOff, Plus, Trash2, MessageSquare, History, RefreshCw, Video, Camera, CameraOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";
import { dayzaFetch } from "@/lib/firebase-session-client";

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export default function ChatPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("/dashboard");
  const [messages, setMessages] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [agentStatus, setAgentStatus] = useState("");
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<{ message: string; imageDataUrl: string | null } | null>(null);
  const [listening, setListening] = useState(false);
  const [interactionMode, setInteractionMode] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastSpokenMessageRef = useRef<string>("");
  const skipNextMessageLoadRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const readJson = async (res: Response) => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: text.slice(0, 180) };
    }
  };

  const loadMessages = useCallback(async (sessionId: string | null) => {
    setLoading(true);
    try {
      const url = sessionId ? `/api/chat?sessionId=${encodeURIComponent(sessionId)}` : "/api/chat";
      const res = await dayzaFetch(url);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Could not load chat messages");
      setMessages(data?.messages ?? []);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not load chat messages");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSessions = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const offset = reset ? 0 : historyOffset;
      const res = await dayzaFetch(`/api/chat/sessions?offset=${offset}&limit=10`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.error ?? "Could not load chat sessions");
      const nextSessions = data?.sessions ?? [];
      setSessions((prev) => reset ? nextSessions : [...prev, ...nextSessions.filter((chat: any) => !prev.some((item: any) => item.id === chat.id))]);
      setHistoryOffset(data?.nextOffset ?? offset + nextSessions.length);
      setHistoryHasMore(Boolean(data?.hasMore));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Could not load chat sessions");
    } finally {
      setHistoryLoading(false);
      setHistoryLoaded(true);
    }
  }, [historyLoading, historyOffset]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (skipNextMessageLoadRef.current === activeSessionId) {
      skipNextMessageLoadRef.current = null;
      return;
    }
    loadMessages(activeSessionId).catch(console.error);
  }, [activeSessionId, loadMessages]);
  useEffect(() => {
    if (historyOpen && !historyLoaded) loadSessions({ reset: true }).catch(console.error);
  }, [historyLoaded, historyOpen, loadSessions]);
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (from?.startsWith("/") && !from.startsWith("//") && !from.startsWith("/chat")) {
      setReturnTo(from);
    }
    if (prompt) setInput(prompt);
    if (new URLSearchParams(window.location.search).get("mode") === "voice") setInteractionMode(true);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current?.scrollHeight ?? 0, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      window.speechSynthesis?.cancel?.();
      cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!interactionMode || !voiceReplies || streaming) return;
    const lastAssistant = [...(messages ?? [])].reverse().find((message) => message?.role === "assistant" && message?.content?.trim());
    const content = lastAssistant?.content?.trim();
    if (!content || content === lastSpokenMessageRef.current || !("speechSynthesis" in window)) return;
    lastSpokenMessageRef.current = content;
    const plainText = content.replace(/\s+/g, " ").slice(0, 1200);
    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [interactionMode, messages, streaming, voiceReplies]);

  const createChatSession = useCallback(async (title = "New chat", options: { clearMessages?: boolean; skipAutoLoad?: boolean } = {}) => {
    const res = await dayzaFetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await readJson(res);
    if (!res.ok) {
      toast.error(data?.error ?? "Could not start chat");
      return null;
    }
    if (data?.session?.id) {
      setSessions((prev) => [data.session, ...(prev ?? [])]);
      if (options.skipAutoLoad) skipNextMessageLoadRef.current = data.session.id;
      setActiveSessionId(data.session.id);
      if (options.clearMessages !== false) setMessages([]);
      return data.session.id as string;
    }
    return null;
  }, []);

  const sendMessage = useCallback(async (messageOverride?: string, imageOverride?: string | null) => {
    const outgoingText = messageOverride ?? input.trim();
    const outgoingImage = imageOverride ?? imageDataUrl;
    if ((!outgoingText && !outgoingImage) || streaming) return;
    setStreaming(true);
    setAgentStatus(outgoingImage ? "Uploading image and preparing context..." : "Preparing your request...");
    setLastFailedMessage(null);
    const userMsg = outgoingText;
    const attachedImage = outgoingImage;
    setInput("");
    setImageDataUrl(null);
    const assistantMessageId = `stream-${Date.now()}`;
    setMessages(prev => [...(prev ?? []), {
      role: "user",
      content: userMsg || "Analyze this image.",
      imageDataUrl: attachedImage,
      id: `temp-${Date.now()}`,
    }]);
    setMessages(prev => [...(prev ?? []), { role: "assistant", content: "", id: assistantMessageId }]);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const targetSessionId = activeSessionId ?? await createChatSession(userMsg || "Image chat", { clearMessages: false, skipAutoLoad: true });
      if (!targetSessionId) {
        setLastFailedMessage({ message: userMsg, imageDataUrl: attachedImage });
        setMessages(prev => (prev ?? []).filter((message) => message.id !== assistantMessageId));
        setStreaming(false);
        return;
      }

      const res = await dayzaFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ message: userMsg, imageDataUrl: attachedImage, sessionId: targetSessionId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLastFailedMessage({ message: userMsg, imageDataUrl: attachedImage });
        toast.error(data?.error ?? "Agent response failed. You can retry.");
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = "";
      setAgentStatus("Reading profile, recent logs, and planning the reply...");

      while (true) {
        const { done, value } = (await reader?.read()) ?? { done: true, value: undefined };
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split("\n");
        partialRead = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") { setStreaming(false); return; }
            try {
              const parsed = JSON.parse(data);
              if (parsed?.content) {
                setAgentStatus("Writing response...");
                setMessages(prev => {
                  const updated = [...(prev ?? [])];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: (last.content ?? "") + parsed.content };
                  }
                  return updated;
                });
              }
              if (Array.isArray(parsed?.undoActions) && parsed.undoActions.length > 0) {
                setMessages(prev => {
                  const updated = [...(prev ?? [])];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      undoActions: [...(last.undoActions ?? []), ...parsed.undoActions],
                    };
                  }
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err?.name === "AbortError") {
        toast.success("Agent response stopped");
        setMessages(prev => {
          const updated = [...(prev ?? [])];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content) return updated.slice(0, -1);
          if (last?.role === "assistant") updated[updated.length - 1] = { ...last, content: `${last.content}\n\nStopped.`.trim() };
          return updated;
        });
        setStreaming(false);
        setAgentStatus("");
        abortControllerRef.current = null;
        return;
      }
      setLastFailedMessage({ message: userMsg, imageDataUrl: attachedImage });
      toast.error("Agent response failed. You can retry.");
    }
    setStreaming(false);
    setAgentStatus("");
    abortControllerRef.current = null;
  }, [activeSessionId, createChatSession, imageDataUrl, input, streaming]);

  const stopAgentResponse = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported in this browser.");
      toast.error("Camera is not supported in this browser");
      return;
    }
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera permission was blocked.");
      toast.error("Camera permission was blocked");
    }
  }, [cameraOn, stopCamera]);

  const captureCameraFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !cameraOn || !video.videoWidth || !video.videoHeight) {
      toast.error("Camera is not ready yet");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImageDataUrl(canvas.toDataURL("image/jpeg", 0.82));
    toast.success("Frame attached. Ask Dayza what to check.");
  }, [cameraOn]);

  const endLiveAgent = useCallback(() => {
    recognitionRef.current?.stop?.();
    window.speechSynthesis?.cancel?.();
    setListening(false);
    setSpeaking(false);
    stopCamera();
    setInteractionMode(false);
  }, [stopCamera]);

  const handleSend = useCallback(async () => {
    await sendMessage();
  }, [sendMessage]);

  const retryLastMessage = useCallback(async () => {
    if (!lastFailedMessage) return;
    await sendMessage(lastFailedMessage.message, lastFailedMessage.imageDataUrl);
  }, [lastFailedMessage, sendMessage]);

  const undoAgentAction = useCallback(async (messageId: string, undoId: string) => {
    if (undoingId) return;
    setUndoingId(undoId);
    try {
      const res = await dayzaFetch("/api/agent-undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Undo failed");
      setMessages(prev => (prev ?? []).map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          undoActions: (message.undoActions ?? []).map((action: any) =>
            action.id === undoId ? { ...action, undone: true, label: "Undone" } : action
          ),
        };
      }));
      toast.success(data?.message ?? "Action undone");
    } catch (error: any) {
      toast.error(error?.message ?? "Undo failed");
    } finally {
      setUndoingId(null);
    }
  }, [undoingId]);

  const startNewChat = useCallback(async () => {
    setActiveSessionId(null);
    skipNextMessageLoadRef.current = null;
    setMessages([]);
    setInput("");
    setImageDataUrl(null);
    setHistoryOpen(false);
  }, []);

  const refreshChat = useCallback(async () => {
    if (activeSessionId) await loadMessages(activeSessionId);
    else {
      setMessages([]);
      toast.success("Ready for a new chat");
    }
  }, [activeSessionId, loadMessages]);

  const deleteChat = useCallback(async (sessionId: string) => {
    if (!confirm("Delete this chat and its images permanently?")) return;
    const res = await dayzaFetch(`/api/chat/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete chat");
      return;
    }
    const remaining = sessions.filter((item) => item.id !== sessionId);
    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[0]?.id ?? null);
      setMessages([]);
    }
    toast.success("Chat deleted");
  }, [activeSessionId, sessions]);

  const handleImageSelect = useCallback((file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const loadAttachmentImage = useCallback(async (messageId: string, attachment: any) => {
    if (!activeSessionId || !attachment?.id || attachment?.url || attachment?.deleted) return;
    setLoadingAttachmentId(attachment.id);
    try {
      const params = new URLSearchParams({ sessionId: activeSessionId, attachmentId: attachment.id });
      const res = await dayzaFetch(`/api/chat/attachments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not load image");
      setMessages((prev) => prev.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          attachments: (message.attachments ?? []).map((item: any) => item.id === attachment.id ? { ...item, ...data } : item),
        };
      }));
    } catch (error: any) {
      toast.error(error?.message ?? "Could not load image");
    } finally {
      setLoadingAttachmentId(null);
    }
  }, [activeSessionId]);

  const toggleVoiceInput = useCallback((options: { autoSend?: boolean } = {}) => {
    if (streaming) return;

    if (listening) {
      recognitionRef.current?.stop?.();
      setListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Microphone input is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      setInput((finalTranscript + interimTranscript).trim());
    };
    recognition.onerror = () => {
      toast.error("Could not hear that clearly");
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      const spoken = finalTranscript.trim();
      if (options.autoSend && spoken) {
        void sendMessage(spoken, null);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, sendMessage, streaming]);

  const closeChat = useCallback(() => {
    stopCamera();
    window.speechSynthesis?.cancel?.();
    router.push(returnTo);
  }, [returnTo, router, stopCamera]);

  const quickActions = [
    { label: "Daily check-in", detail: "Workout, meals, water, meds" },
    { label: "Log food", detail: "Macros and minerals" },
    { label: "Replace exercise", detail: "Fresh gym-friendly option" },
    { label: "Analyze spending", detail: "Cards, banks, budgets" },
  ];

  return (
    <div className="flex h-[calc(100svh_-_7rem_-_env(safe-area-inset-bottom))] min-h-[32rem] min-w-0 flex-col sm:h-[calc(100dvh-8rem)]">
      <FadeIn>
        <div className="mb-2 flex items-center justify-end gap-2 sm:mb-3 sm:items-start sm:justify-between">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Dayza Agent</h2>
            <p className="mt-1 hidden text-sm text-muted-foreground min-[390px]:block">Ask about fitness, food, spends, reminders, and progress</p>
          </div>
          <div className="flex items-center gap-1 sm:shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={refreshChat}
              disabled={loading || streaming}
              aria-label="Reload chat"
              title="Reload chat"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Open chat history" title="Chat history">
                  <History className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[82svh] max-w-md overflow-hidden p-0">
                <DialogHeader className="border-b border-border p-4">
                  <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                    <DialogTitle className="flex min-w-0 items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      Chat History
                    </DialogTitle>
                    <Button type="button" size="sm" onClick={startNewChat} disabled={streaming}>
                      <Plus className="mr-1 h-4 w-4" />
                      New
                    </Button>
                  </div>
                </DialogHeader>
                <div
                  className="max-h-[64svh] overflow-y-auto p-3 ios-scroll"
                  onScroll={(event) => {
                    const target = event.currentTarget;
                    const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 48;
                    if (nearBottom && historyHasMore && !historyLoading) loadSessions().catch(console.error);
                  }}
                >
                  {historyLoading && sessions.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Loading history...
                    </div>
                  ) : (sessions ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No chats yet. Tap New or send a message to start fresh.</div>
                  ) : (
                    <div className="space-y-2">
                      {sessions.map((chat) => (
                        <div key={chat.id} className={`group flex items-center gap-2 rounded-lg p-2 ${activeSessionId === chat.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setActiveSessionId(chat.id);
                              setHistoryOpen(false);
                            }}
                            disabled={streaming}
                          >
                            <p className="truncate text-sm font-semibold">{chat.title || "New chat"}</p>
                            <p className="truncate text-xs text-muted-foreground">{chat.messages?.[0]?.content || `${chat._count?.messages ?? 0} messages`}</p>
                          </button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteChat(chat.id)} disabled={streaming}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      {historyHasMore && (
                        <Button type="button" variant="outline" className="w-full" onClick={() => loadSessions().catch(console.error)} disabled={historyLoading}>
                          {historyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Load more chats
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button type="button" variant="ghost" size="icon" onClick={startNewChat} disabled={streaming} aria-label="New chat" title="New chat">
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeChat}
              aria-label="Close Dayza Agent"
              title="Close Dayza Agent"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </FadeIn>

      {interactionMode && (
        <div className="mb-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
          <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl border border-primary/25 bg-primary/10 text-primary shadow-inner">
                <Bot className="h-8 w-8" />
                <span className={`absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-card ${streaming || speaking ? "animate-pulse bg-emerald-400" : "bg-muted"}`} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg font-bold tracking-tight">Dayza Live Agent</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {listening
                    ? "Listening now. Speak naturally."
                    : speaking
                      ? "Dayza is speaking."
                      : streaming
                        ? "Dayza is thinking through your request."
                        : "Tap Talk for voice, or turn on camera and capture what Dayza should inspect."}
                </p>
                {input && listening && (
                  <p className="mt-2 line-clamp-2 rounded-lg border border-primary/20 bg-background/60 px-3 py-2 text-xs text-primary">
                    {input}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-background/70">
                {cameraOn ? (
                  <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <Video className="h-6 w-6" />
                    <span className="text-xs">{cameraError || "Camera off"}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-5 gap-2">
                <Button
                  type="button"
                  variant={listening ? "default" : "outline"}
                  size="icon"
                  onClick={() => toggleVoiceInput({ autoSend: true })}
                  disabled={streaming}
                  title={listening ? "Stop listening" : "Talk to Dayza"}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant={cameraOn ? "default" : "outline"}
                  size="icon"
                  onClick={toggleCamera}
                  disabled={streaming}
                  title={cameraOn ? "Turn camera off" : "Turn camera on"}
                >
                  {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={captureCameraFrame}
                  disabled={!cameraOn || streaming}
                  title="Capture camera frame"
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={voiceReplies ? "default" : "outline"}
                  size="icon"
                  onClick={() => {
                    if (voiceReplies) {
                      window.speechSynthesis?.cancel?.();
                      setSpeaking(false);
                    }
                    setVoiceReplies((value) => !value);
                  }}
                  title={voiceReplies ? "Mute Dayza voice" : "Unmute Dayza voice"}
                >
                  {voiceReplies ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
                <Button type="button" variant="destructive" size="icon" onClick={endLiveAgent} title="End live mode">
                  <PhoneOff className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
        {loading && (
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Loading chat...
          </div>
        )}
        {lastFailedMessage && !streaming && (
          <div className="grid gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs sm:flex sm:items-center sm:justify-between">
            <span className="text-destructive">Last message failed.</span>
            <Button type="button" size="sm" variant="outline" onClick={retryLastMessage} className="w-full sm:w-auto">
              Retry
            </Button>
          </div>
        )}
        {streaming && (
          <div className="grid gap-2 border-b border-border bg-primary/5 px-3 py-2 text-xs text-muted-foreground sm:flex sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              <span className="truncate">{agentStatus || "Dayza is working..."}</span>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={stopAgentResponse} className="w-full sm:w-auto">
              Stop
            </Button>
          </div>
        )}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-2.5 pb-4 sm:space-y-4 sm:p-4">
          {(messages ?? [])?.length === 0 && (
            <div className="mx-auto flex min-h-full max-w-md flex-col justify-center py-6 text-center sm:py-10">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="h-7 w-7" />
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight">{interactionMode ? "Talk to Dayza" : "How can Dayza help?"}</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {interactionMode
                  ? "Use voice for a hands-free chat, or show Dayza a meal, receipt, medicine, or workout screen."
                  : "Pick a quick action or type naturally. Dayza can log, plan, review, and explain."}
              </p>
              {interactionMode && (
                <div className="mx-auto mt-5 grid w-full max-w-sm grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleVoiceInput({ autoSend: true })}
                    disabled={streaming}
                    className={`rounded-2xl border px-4 py-5 text-center transition active:scale-95 ${listening ? "border-primary bg-primary/15 text-primary" : "border-border bg-background/70 hover:border-primary/40 hover:bg-muted/40"}`}
                  >
                    <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </span>
                    <span className="block text-sm font-semibold">{listening ? "Listening..." : "Talk"}</span>
                    <span className="mt-1 block text-[0.7rem] text-muted-foreground">Auto-send voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={streaming}
                    className="rounded-2xl border border-border bg-background/70 px-4 py-5 text-center transition hover:border-primary/40 hover:bg-muted/40 active:scale-95"
                  >
                    <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
                      <Video className="h-5 w-5" />
                    </span>
                    <span className="block text-sm font-semibold">Show</span>
                    <span className="mt-1 block text-[0.7rem] text-muted-foreground">Camera/photo</span>
                  </button>
                </div>
              )}
              <div className="mt-5 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => setInput(action.label)}
                    className="rounded-lg border border-border bg-background/70 px-3 py-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
                  >
                    <span className="block text-sm font-semibold leading-tight">{action.label}</span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">{action.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(messages ?? []).map((msg: any, i: number) => (
            <div key={msg?.id ?? i} className={`flex gap-2 sm:gap-3 ${msg?.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg?.role === "assistant" && (
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 sm:flex">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[94%] overflow-hidden rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] sm:max-w-[80%] sm:px-4 ${
                msg?.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}>
                {(msg?.imageDataUrl || msg?.attachments?.[0]?.url) && (
                  <img
                    src={msg.imageDataUrl || msg.attachments[0].url}
                    alt="Chat attachment"
                    className="mb-2 max-h-48 w-full rounded-md object-cover"
                  />
                )}
                {!msg?.imageDataUrl && !msg?.attachments?.[0]?.url && msg?.attachments?.[0]?.hasImage && (
                  <button
                    type="button"
                    className="mb-2 flex w-full items-center justify-center rounded-md border border-dashed border-border bg-background/40 px-3 py-4 text-xs text-muted-foreground hover:bg-background"
                    onClick={() => loadAttachmentImage(msg.id, msg.attachments[0])}
                    disabled={loadingAttachmentId === msg.attachments[0].id}
                  >
                    {loadingAttachmentId === msg.attachments[0].id ? "Loading image..." : "Tap to load image"}
                  </button>
                )}
                {!msg?.imageDataUrl && msg?.attachments?.[0]?.deleted && (
                  <div className="mb-2 rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                    {msg.attachments[0].deletedReason || "Image expired"}
                  </div>
                )}
                {msg?.content || (streaming && i === (messages?.length ?? 0) - 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : "")}
                {msg?.role === "assistant" && Array.isArray(msg?.undoActions) && msg.undoActions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-2">
                    {msg.undoActions.map((action: any) => (
                      <Button
                        key={action.id}
                        type="button"
                        size="sm"
                        variant={action.undone ? "secondary" : "outline"}
                        className="h-8 rounded-full px-3 text-xs"
                        disabled={Boolean(action.undone) || undoingId === action.id}
                        onClick={() => undoAgentAction(msg.id, action.id)}
                        title={action.actionLabel ? `Undo: ${action.actionLabel}` : "Undo this agent action"}
                      >
                        {undoingId === action.id && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                        {action.undone ? "Undone" : "Undo"}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              {msg?.role === "user" && (
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary sm:flex">
                  <User className="w-4 h-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-border bg-card p-2.5 sm:p-4">
          {imageDataUrl && (
            <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-muted/40 p-2">
              <img src={imageDataUrl} alt="Selected food" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Image selected</p>
                <p className="hidden text-muted-foreground min-[390px]:block">Send food photos or payment screenshots for logging.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setImageDataUrl(null)} disabled={streaming}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSend(); }} className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_2.5rem] gap-1.5 sm:grid-cols-[auto_auto_1fr_auto] sm:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                handleImageSelect(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Attach food photo"
              className="h-10 w-10 shrink-0 sm:h-11 sm:w-11"
            >
              <ImagePlus className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant={listening ? "default" : "outline"}
              size="icon"
              onClick={() => toggleVoiceInput()}
              disabled={streaming}
              title={listening ? "Stop listening" : "Speak message"}
              className="h-10 w-10 shrink-0 sm:h-11 sm:w-11"
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Input
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              placeholder={listening ? "Listening..." : "Ask, log food/spends, attach image..."}
              disabled={streaming}
              className="h-10 min-w-0 px-3 text-sm sm:h-11"
            />
            <Button type={streaming ? "button" : "submit"} onClick={streaming ? stopAgentResponse : undefined} disabled={!streaming && (!input?.trim() && !imageDataUrl)} className="h-10 w-10 shrink-0 px-0 sm:h-11 sm:w-11" title={streaming ? "Stop response" : "Send"}>
              {streaming ? <X className="w-4 h-4" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </Card>
      </div>
    </div>
  );
}
