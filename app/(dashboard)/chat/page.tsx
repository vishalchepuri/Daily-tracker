"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImagePlus, Send, Bot, User, Loader2, X, Mic, MicOff, Plus, Trash2, MessageSquare } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/chat/sessions");
    const data = await res.json();
    const nextSessions = data?.sessions ?? [];
    setSessions(nextSessions);
    if (!activeSessionId && nextSessions[0]?.id) setActiveSessionId(nextSessions[0].id);
    if (activeSessionId && !nextSessions.some((chat: any) => chat.id === activeSessionId)) {
      setActiveSessionId(nextSessions[0]?.id ?? null);
      if (!nextSessions[0]?.id) setMessages([]);
    }
  }, [activeSessionId]);

  const loadMessages = useCallback(async (sessionId: string | null) => {
    const url = sessionId ? `/api/chat?sessionId=${encodeURIComponent(sessionId)}` : "/api/chat";
    fetch(url).then(r => r.json()).then(d => setMessages(d?.messages ?? [])).catch(console.error);
  }, []);

  useEffect(() => { loadSessions().catch(console.error); }, [loadSessions]);
  useEffect(() => { loadMessages(activeSessionId).catch(console.error); }, [activeSessionId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current?.scrollHeight ?? 0, behavior: "smooth" });
  }, [messages]);

  const createChatSession = useCallback(async (title = "New chat") => {
    const res = await fetch("/api/chat/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (data?.session?.id) {
      setSessions((prev) => [data.session, ...(prev ?? [])]);
      setActiveSessionId(data.session.id);
      setMessages([]);
      return data.session.id as string;
    }
    return null;
  }, []);

  const handleSend = useCallback(async () => {
    if ((!input?.trim() && !imageDataUrl) || streaming) return;
    const userMsg = input.trim();
    const attachedImage = imageDataUrl;
    const targetSessionId = activeSessionId ?? await createChatSession(userMsg || "Image chat");
    if (!targetSessionId) {
      toast.error("Could not start chat");
      return;
    }
    setInput("");
    setImageDataUrl(null);
    setMessages(prev => [...(prev ?? []), {
      role: "user",
      content: userMsg || "Analyze this image.",
      imageDataUrl: attachedImage,
      id: `temp-${Date.now()}`,
    }]);
    setStreaming(true);
    setMessages(prev => [...(prev ?? []), { role: "assistant", content: "", id: `stream-${Date.now()}` }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, imageDataUrl: attachedImage, sessionId: targetSessionId }),
      });

      if (!res.ok) { setStreaming(false); return; }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = "";

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
                setMessages(prev => {
                  const updated = [...(prev ?? [])];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    updated[updated.length - 1] = { ...last, content: (last.content ?? "") + parsed.content };
                  }
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch (err) { console.error(err); }
    setStreaming(false);
    loadSessions().catch(console.error);
  }, [activeSessionId, createChatSession, imageDataUrl, input, loadSessions, streaming]);

  const startNewChat = useCallback(async () => {
    await createChatSession("New chat");
  }, [createChatSession]);

  const deleteChat = useCallback(async (sessionId: string) => {
    if (!confirm("Delete this chat and its images permanently?")) return;
    const res = await fetch(`/api/chat/sessions?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
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

  const toggleVoiceInput = useCallback(() => {
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
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, streaming]);

  const closeChat = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  return (
    <div className="flex h-[calc(100svh_-_11.25rem_-_env(safe-area-inset-bottom))] min-h-[28rem] flex-col sm:h-[calc(100dvh-8rem)]">
      <FadeIn>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Dayza Agent</h2>
            <p className="text-muted-foreground text-sm mt-1">Ask about fitness, food, spends, reminders, and progress</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={closeChat}
            aria-label="Close AI coach"
            title="Close AI coach"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </FadeIn>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[19rem_1fr]">
        <Card className="flex min-h-[10rem] flex-col overflow-hidden">
          <CardHeader className="border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 text-primary" />
                Chat History
              </CardTitle>
              <Button type="button" size="sm" onClick={startNewChat} disabled={streaming}>
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-2 ios-scroll">
            {(sessions ?? []).length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No chats yet. Tap New or send a message to start fresh.</div>
            ) : (
              <div className="space-y-1">
                {sessions.map((chat) => (
                  <div key={chat.id} className={`group flex items-center gap-2 rounded-lg p-2 ${activeSessionId === chat.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveSessionId(chat.id)} disabled={streaming}>
                      <p className="truncate text-sm font-semibold">{chat.title || "New chat"}</p>
                      <p className="truncate text-xs text-muted-foreground">{chat.messages?.[0]?.content || `${chat._count?.messages ?? 0} messages`}</p>
                    </button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 opacity-100 lg:opacity-0 lg:group-hover:opacity-100" onClick={() => deleteChat(chat.id)} disabled={streaming}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {(messages ?? [])?.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-primary/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Ask me anything about fitness, nutrition, or your workout plan!</p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {["Best exercises for chest?", "How much protein do I need?", "Meal prep ideas for muscle gain", "How to break a plateau?"].map((q: string) => (
                  <Button key={q} variant="outline" size="sm" onClick={() => { setInput(q); }}>
                    {q}
                  </Button>
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
              <div className={`max-w-[88%] overflow-hidden break-words rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap sm:max-w-[80%] sm:px-4 ${
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
                {msg?.content || (streaming && i === (messages?.length ?? 0) - 1 ? <Loader2 className="w-4 h-4 animate-spin" /> : "")}
              </div>
              {msg?.role === "user" && (
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary sm:flex">
                  <User className="w-4 h-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border bg-card p-3 sm:p-4">
          {imageDataUrl && (
            <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-muted/40 p-2">
              <img src={imageDataUrl} alt="Selected food" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Image selected</p>
                <p className="text-muted-foreground">Send food photos or sleep screenshots for logging.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setImageDataUrl(null)} disabled={streaming}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
          <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); handleSend(); }} className="grid grid-cols-[auto_auto_1fr_auto] gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
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
              className="h-11 w-11 shrink-0"
            >
              <ImagePlus className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant={listening ? "default" : "outline"}
              size="icon"
              onClick={toggleVoiceInput}
              disabled={streaming}
              title={listening ? "Stop listening" : "Speak message"}
              className="h-11 w-11 shrink-0"
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
            <Input
              value={input}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              placeholder={listening ? "Listening..." : "Ask, log food/spends, attach image..."}
              disabled={streaming}
              className="h-11 min-w-0"
            />
            <Button type="submit" disabled={streaming || (!input?.trim() && !imageDataUrl)} className="h-11 w-11 shrink-0 px-0">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </Card>
      </div>
    </div>
  );
}
