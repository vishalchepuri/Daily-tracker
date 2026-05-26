"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ImagePlus, Send, Bot, User, Loader2, X, Mic, MicOff, Plus, Trash2, MessageSquare, History, RefreshCw } from "lucide-react";
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
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<{ message: string; imageDataUrl: string | null } | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const skipNextMessageLoadRef = useRef<string | null>(null);

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
      const res = await fetch(url);
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
      const res = await fetch(`/api/chat/sessions?offset=${offset}&limit=10`);
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
    if (from?.startsWith("/") && !from.startsWith("//") && !from.startsWith("/chat")) {
      setReturnTo(from);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current?.scrollHeight ?? 0, behavior: "smooth" });
  }, [messages]);

  const createChatSession = useCallback(async (title = "New chat", options: { clearMessages?: boolean; skipAutoLoad?: boolean } = {}) => {
    const res = await fetch("/api/chat/sessions", {
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
      const targetSessionId = activeSessionId ?? await createChatSession(userMsg || "Image chat", { clearMessages: false, skipAutoLoad: true });
      if (!targetSessionId) {
        setLastFailedMessage({ message: userMsg, imageDataUrl: attachedImage });
        setMessages(prev => (prev ?? []).filter((message) => message.id !== assistantMessageId));
        setStreaming(false);
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (err) {
      console.error(err);
      setLastFailedMessage({ message: userMsg, imageDataUrl: attachedImage });
      toast.error("Agent response failed. You can retry.");
    }
    setStreaming(false);
  }, [activeSessionId, createChatSession, imageDataUrl, input, streaming]);

  const handleSend = useCallback(async () => {
    await sendMessage();
  }, [sendMessage]);

  const retryLastMessage = useCallback(async () => {
    if (!lastFailedMessage) return;
    await sendMessage(lastFailedMessage.message, lastFailedMessage.imageDataUrl);
  }, [lastFailedMessage, sendMessage]);

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

  const loadAttachmentImage = useCallback(async (messageId: string, attachment: any) => {
    if (!activeSessionId || !attachment?.id || attachment?.url || attachment?.deleted) return;
    setLoadingAttachmentId(attachment.id);
    try {
      const params = new URLSearchParams({ sessionId: activeSessionId, attachmentId: attachment.id });
      const res = await fetch(`/api/chat/attachments?${params.toString()}`);
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
    router.push(returnTo);
  }, [returnTo, router]);

  return (
    <div className="flex h-[calc(100svh_-_9.25rem_-_env(safe-area-inset-bottom))] min-h-[30rem] flex-col sm:h-[calc(100dvh-8rem)]">
      <FadeIn>
        <div className="mb-2 flex items-start justify-between gap-2 sm:mb-3">
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Dayza Agent</h2>
            <p className="mt-1 hidden text-sm text-muted-foreground min-[390px]:block">Ask about fitness, food, spends, reminders, and progress</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
                  <div className="flex items-center justify-between gap-3">
                    <DialogTitle className="flex items-center gap-2">
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

      <div className="flex min-h-0 flex-1">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {loading && (
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Loading chat...
          </div>
        )}
        {lastFailedMessage && !streaming && (
          <div className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
            <span className="text-destructive">Last message failed.</span>
            <Button type="button" size="sm" variant="outline" onClick={retryLastMessage}>
              Retry
            </Button>
          </div>
        )}
        {streaming && (
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Dayza is thinking...
          </div>
        )}
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-2.5 sm:space-y-4 sm:p-4">
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
              <div className={`max-w-[86%] overflow-hidden break-words rounded-lg px-3 py-2.5 text-sm whitespace-pre-wrap sm:max-w-[80%] sm:px-4 ${
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
              </div>
              {msg?.role === "user" && (
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary sm:flex">
                  <User className="w-4 h-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-border bg-card p-2.5 sm:p-4">
          {imageDataUrl && (
            <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-muted/40 p-2">
              <img src={imageDataUrl} alt="Selected food" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Image selected</p>
                <p className="text-muted-foreground">Send food photos or payment screenshots for logging.</p>
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
              onClick={toggleVoiceInput}
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
            <Button type="submit" disabled={streaming || (!input?.trim() && !imageDataUrl)} className="h-10 w-10 shrink-0 px-0 sm:h-11 sm:w-11">
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </Card>
      </div>
    </div>
  );
}
