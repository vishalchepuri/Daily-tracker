"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  ListTodo,
  NotebookText,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { completeGoogleFeatureRedirect, connectGoogleFeature } from "@/lib/google-feature-client";
import { formatAppDate } from "@/lib/local-dates";

function formatDuration(seconds?: number) {
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${String(mins).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatViews(value?: number | null) {
  if (!value) return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M views`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K views`;
  return `${value} views`;
}

function priorityLabel(score?: number) {
  if ((score ?? 0) >= 55) return "Must watch";
  if ((score ?? 0) >= 35) return "High priority";
  if ((score ?? 0) >= 18) return "Useful";
  return "Low signal";
}

const learningCategories = [
  { value: "fitness", label: "Fitness" },
  { value: "nutrition", label: "Nutrition" },
  { value: "finance", label: "Finance" },
  { value: "productivity", label: "Productivity" },
  { value: "other", label: "Other" },
] as const;

const learningStatuses = [
  { value: "saved", label: "Saved" },
  { value: "watched", label: "Watched" },
  { value: "summarized", label: "Summarized" },
  { value: "acted_on", label: "Action planned" },
  { value: "completed", label: "Completed" },
] as const;

interface SavedSummary {
  id?: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  summary: string;
  source?: string | null;
  category?: string | null;
  status?: string | null;
  notes?: string | null;
  takeaways?: string[] | null;
  nextAction?: string | null;
  savedAt: string;
  updatedAt?: string | null;
}

function categoryLabel(value?: string | null) {
  return learningCategories.find((item) => item.value === value)?.label ?? "Other";
}

function statusLabel(value?: string | null) {
  return learningStatuses.find((item) => item.value === value)?.label ?? "Saved";
}

function inferLearningCategory(video: any) {
  const haystack = `${video?.title ?? ""} ${video?.description ?? ""} ${video?.matchedTopics?.join(" ") ?? ""}`.toLowerCase();
  if (/(protein|diet|meal|vitamin|nutrition|food|calorie)/.test(haystack)) return "nutrition";
  if (/(workout|exercise|gym|fat loss|muscle|fitness|cardio)/.test(haystack)) return "fitness";
  if (/(money|finance|invest|ipo|credit|bank|expense)/.test(haystack)) return "finance";
  if (/(productivity|workflow|automation|ai|coding|builder|system)/.test(haystack)) return "productivity";
  return "other";
}

export default function YtSummaryPage() {
  const searchParams = useSearchParams();
  const videoId = searchParams.get("videoId");
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<any>(null);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [summary, setSummary] = useState("");
  const [source, setSource] = useState("");
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [needsConnection, setNeedsConnection] = useState(false);
  const [youtubeError, setYoutubeError] = useState<{ message: string; actionUrl?: string } | null>(null);
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [activeTab, setActiveTab] = useState("feed");
  const [importHealth, setImportHealth] = useState<any>(null);
  const [connectingYoutube, setConnectingYoutube] = useState(false);
  const [savedSearch, setSavedSearch] = useState("");
  const [savingLearning, setSavingLearning] = useState(false);
  const [creatingReminder, setCreatingReminder] = useState(false);
  const [learningForm, setLearningForm] = useState({
    category: "other",
    status: "saved",
    notes: "",
    takeawaysText: "",
    nextAction: "",
  });

  const errorMessage = (value: any, fallback: string) => {
    if (typeof value === "string") return value;
    if (value?.message) return String(value.message);
    return fallback;
  };

  const loadSubscriptionFeed = async () => {
    setLoadingSubscriptions(true);
    setLoadingVideos(true);
    try {
      const res = await fetch("/api/youtube/feed");
      const data = await res.json();
      if (!res.ok) {
        setNeedsConnection(Boolean(data?.needsConnection));
        if (!data?.needsConnection) {
          setYoutubeError({ message: errorMessage(data?.error, "Failed to load subscription feed"), actionUrl: data?.actionUrl });
          toast.error(errorMessage(data?.error, "Failed to load subscription feed"));
        }
        return;
      }
      if (data?.needsConnection) {
        setNeedsConnection(true);
        setSubscriptions([]);
        setVideos([]);
        return;
      }
      setNeedsConnection(false);
      setYoutubeError(null);
      setSubscriptions(data.subscriptions ?? []);
      setVideos(data.videos ?? []);
      setSelectedChannel(null);
      setSelectedVideo(null);
      setSummary("");
      setSource("");
    } catch {
      toast.error("Failed to load subscription feed");
    } finally {
      setLoadingSubscriptions(false);
      setLoadingVideos(false);
    }
  };

  const loadImportHealth = async () => {
    try {
      const res = await fetch("/api/import-health");
      const data = res.ok ? await res.json() : null;
      setImportHealth(data);
    } catch {
      setImportHealth(null);
    }
  };

  const loadSavedLearning = async () => {
    try {
      const res = await fetch("/api/youtube/learning");
      const data = await res.json();
      if (!res.ok) {
        toast.error(errorMessage(data?.error, "Failed to load saved learning"));
        return;
      }
      setSavedSummaries(Array.isArray(data?.items) ? data.items : []);
    } catch {
      toast.error("Failed to load saved learning");
    }
  };

  const connectYoutube = async () => {
    setConnectingYoutube(true);
    try {
      const result = await connectGoogleFeature("https://www.googleapis.com/auth/youtube.readonly");
      if ((result as any)?.redirected) return;
      toast.success("YouTube connected");
      setNeedsConnection(false);
      await Promise.all([loadImportHealth(), loadSubscriptionFeed()]);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not connect YouTube");
    } finally {
      setConnectingYoutube(false);
    }
  };

  useEffect(() => {
    void loadSubscriptionFeed();
    void loadImportHealth();
    void loadSavedLearning();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const completeRedirect = async () => {
      try {
        const result = await completeGoogleFeatureRedirect();
        if (!result || cancelled) return;
        if (result.scope === "https://www.googleapis.com/auth/youtube.readonly") {
          toast.success("YouTube connected");
          setNeedsConnection(false);
          await Promise.all([loadImportHealth(), loadSubscriptionFeed()]);
        }
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message ?? "Could not connect YouTube");
      } finally {
        if (!cancelled) setConnectingYoutube(false);
      }
    };

    void completeRedirect();
    return () => {
      cancelled = true;
    };
  }, []);

  const isSaved = (vid: string) => savedSummaries.some((item) => item.videoId === vid);

  const hydrateLearningForm = (video: any, summaryText: string, sourceText: string, takeaways: string[] = []) => {
    const existing = savedSummaries.find((item) => item.videoId === video.id);
    setLearningForm({
      category: existing?.category ?? inferLearningCategory(video),
      status: existing?.status ?? (summaryText ? "summarized" : "saved"),
      notes: existing?.notes ?? "",
      takeawaysText: (existing?.takeaways ?? takeaways).join("\n"),
      nextAction: existing?.nextAction ?? "",
    });
    if (existing?.summary && !summaryText) setSummary(existing.summary);
    if (existing?.source && !sourceText) setSource(existing.source);
  };

  const removeSaved = async (vid: string) => {
    try {
      const res = await fetch(`/api/youtube/learning?videoId=${encodeURIComponent(vid)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(errorMessage(data?.error, "Failed to remove learning item"));
        return;
      }
      setSavedSummaries((prev) => prev.filter((item) => item.videoId !== vid));
      toast.success("Learning item removed");
    } catch {
      toast.error("Failed to remove learning item");
    }
  };

  const saveLearningItem = async (video: any, summaryText: string, sourceText: string) => {
    if (!video || !summaryText) {
      toast.error("Summarize a video before saving it");
      return;
    }
    setSavingLearning(true);
    try {
      const takeaways = learningForm.takeawaysText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const res = await fetch("/api/youtube/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: video.id,
          title: video.title,
          channelTitle: video.channelTitle,
          thumbnail: video.thumbnail,
          summary: summaryText,
          source: sourceText,
          category: learningForm.category,
          status: learningForm.status,
          notes: learningForm.notes,
          takeaways,
          nextAction: learningForm.nextAction,
          lastViewedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(errorMessage(data?.error, "Failed to save learning item"));
        return;
      }
      setSavedSummaries((prev) => {
        const filtered = prev.filter((item) => item.videoId !== video.id);
        return [data.item, ...filtered];
      });
      toast.success(isSaved(video.id) ? "Learning item updated" : "Learning item saved");
    } catch {
      toast.error("Failed to save learning item");
    } finally {
      setSavingLearning(false);
    }
  };

  const createReminderFromLearning = async () => {
    if (!selectedVideo) {
      toast.error("Choose a video first");
      return;
    }
    setCreatingReminder(true);
    try {
      const title = learningForm.nextAction.trim() || `Review ${selectedVideo.title}`;
      const notes = `From YT Learning: ${selectedVideo.title}${learningForm.notes.trim() ? `\n\nNotes: ${learningForm.notes.trim()}` : ""}`;
      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes,
          contextTag: "follow_up",
          sourceLabel: "yt_learning",
          priority: "medium",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(errorMessage(data?.error, "Failed to create reminder"));
        return;
      }
      toast.success("Reminder created");
      if (learningForm.status === "saved" || learningForm.status === "summarized") {
        setLearningForm((prev) => ({ ...prev, status: "acted_on" }));
      }
    } catch {
      toast.error("Failed to create reminder");
    } finally {
      setCreatingReminder(false);
    }
  };

  const loadVideos = async (channel: any) => {
    setSelectedChannel(channel);
    setSelectedVideo(null);
    setSummary("");
    setSource("");
  };

  const visibleVideos = useMemo(() => {
    const list = selectedChannel ? videos.filter((video) => video.channelId === selectedChannel.channelId) : videos;
    return [...list].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  }, [selectedChannel, videos]);

  const filteredSavedSummaries = useMemo(() => {
    const query = savedSearch.trim().toLowerCase();
    if (!query) return savedSummaries;
    return savedSummaries.filter((item) =>
      [item.title, item.channelTitle, item.summary, item.notes, item.nextAction, ...(item.takeaways ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [savedSearch, savedSummaries]);

  const summarizeVideo = async (video: any) => {
    setSelectedVideo(video);
    setSummary("");
    setSource("");
    const existing = savedSummaries.find((item) => item.videoId === video.id);
    if (existing) hydrateLearningForm(video, existing.summary, existing.source ?? "", existing.takeaways ?? []);
    setSummarizing(true);
    try {
      const res = await fetch("/api/youtube/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.needsConnection) setNeedsConnection(true);
        if (!data?.needsConnection) setYoutubeError({ message: errorMessage(data?.error, "Failed to summarize video"), actionUrl: data?.actionUrl });
        toast.error(errorMessage(data?.error, "Failed to summarize video"));
        return;
      }
      const nextSummary = data.summary ?? "";
      const nextSource = data.source ?? "";
      setSummary(nextSummary);
      setSource(nextSource);
      hydrateLearningForm(video, nextSummary, nextSource, Array.isArray(data?.takeaways) ? data.takeaways : []);
    } catch {
      toast.error("Failed to summarize video");
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    if (videos.length > 0 && videoId) {
      const targetVideo = videos.find((video: any) => video.id === videoId);
      if (targetVideo) void summarizeVideo(targetVideo);
    }
  }, [videos, videoId]);

  if (needsConnection) {
    return (
      <div className="flex min-h-[60svh] items-center justify-center">
        <Card className="max-w-xl border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-6 w-6 text-red-500" />
              Connect YouTube
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sign in with Google again so Dayza can read your YouTube subscriptions and show videos to summarize.
            </p>
            <Button onClick={connectYoutube} className="w-full" loading={connectingYoutube} disabled={connectingYoutube}>
              Connect YouTube with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const feedContent = (
    <div className="space-y-4">
      {importHealth?.youtube && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${importHealth.youtube.needsReconnect ? "border-amber-500/40 bg-amber-500/10" : "border-primary/20 bg-primary/5"}`}>
          <div className="flex min-w-0 items-center gap-2">
            {importHealth.youtube.needsReconnect ? <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" /> : <Youtube className="h-4 w-4 shrink-0 text-primary" />}
            <div className="min-w-0">
              <p className="truncate font-medium">YouTube: {importHealth.youtube.label}</p>
            </div>
          </div>
          {importHealth.youtube.needsReconnect && (
            <Button variant="outline" size="sm" className="h-8 px-2" onClick={connectYoutube} loading={connectingYoutube} disabled={connectingYoutube}>
              Reconnect
            </Button>
          )}
        </div>
      )}

      {youtubeError && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-amber-100">{youtubeError.message}</p>
            {youtubeError.actionUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={youtubeError.actionUrl} target="_blank" rel="noreferrer">Enable API</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-500" />
              Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSubscriptions ? (
              <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : subscriptions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No subscriptions found.</div>
            ) : (
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 ios-scroll sm:max-h-[32rem]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChannel(null);
                    setSelectedVideo(null);
                    setSummary("");
                    setSource("");
                  }}
                  className={`grid grid-cols-[3rem_1fr] items-center gap-3 rounded-lg p-2 text-left transition hover:bg-muted ${!selectedChannel ? "bg-primary/10 text-primary" : "bg-muted/35"}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-red-500/10 text-red-500">
                    <Youtube className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">All subscriptions</p>
                    <p className="text-xs text-muted-foreground">{videos.length} latest videos</p>
                  </div>
                </button>
                {subscriptions.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => loadVideos(channel)}
                    className={`grid grid-cols-[3rem_1fr] items-center gap-3 rounded-lg p-2 text-left transition hover:bg-muted ${selectedChannel?.channelId === channel.channelId ? "bg-primary/10 text-primary" : "bg-muted/35"}`}
                  >
                    {channel.thumbnail ? <img src={channel.thumbnail} alt="" className="h-12 w-12 rounded-md object-cover" /> : <div className="h-12 w-12 rounded-md bg-muted" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{channel.title}</p>
                      <p className="text-xs text-muted-foreground">{channel.totalItemCount} videos</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader>
              <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
                <CardTitle className="flex min-w-0 items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  <span className="min-w-0 truncate">{selectedChannel ? selectedChannel.title : "Latest Subscription Videos"}</span>
                </CardTitle>
                {visibleVideos.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{visibleVideos.filter((video) => video.kind === "video").length} videos</Badge>
                    <Badge variant="outline">{visibleVideos.filter((video) => video.kind === "short").length} shorts</Badge>
                    <Badge variant="outline">By priority score</Badge>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingVideos ? (
                <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
              ) : visibleVideos.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No recent videos found.</div>
              ) : (
                <div className="grid max-h-[34rem] gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:max-h-none xl:overflow-visible xl:pr-0">
                  {visibleVideos.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => summarizeVideo(video)}
                      className={`overflow-hidden rounded-lg border bg-muted/30 text-left transition hover:border-primary/50 ${selectedVideo?.id === video.id ? "border-primary" : "border-border"}`}
                    >
                      {video.thumbnail ? <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-muted" />}
                      <div className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={(video.priorityScore ?? 0) >= 35 ? "default" : "secondary"} className="gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {priorityLabel(video.priorityScore)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Score {video.priorityScore ?? 0}</span>
                        </div>
                        <p className="line-clamp-2 text-sm font-semibold">{video.title}</p>
                        <p className="truncate text-xs font-medium text-muted-foreground">{video.channelTitle}</p>
                        {video.description && <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{video.description}</p>}
                        {video.matchedTopics?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {video.matchedTopics.slice(0, 3).map((topic: string) => (
                              <Badge key={topic} variant="outline" className="text-[10px] capitalize">{topic}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{formatAppDate(video.publishedAt, { day: "2-digit", month: "short", year: "numeric" })}</Badge>
                          {video.durationSeconds > 0 && <Badge variant="outline">{formatDuration(video.durationSeconds)}</Badge>}
                          {video.viewCount > 0 && <Badge variant="outline">{formatViews(video.viewCount)}</Badge>}
                          <Badge variant={video.kind === "video" ? "default" : "outline"}>{video.kind === "video" ? "Video" : "Short"}</Badge>
                          {isSaved(video.id) && <Badge variant="secondary" className="gap-1 text-primary"><BookmarkCheck className="h-2.5 w-2.5" />Saved</Badge>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Learning Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedVideo ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Click a video to generate a summary and save your notes.</div>
              ) : summarizing ? (
                <div className="space-y-3">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold">{selectedVideo.title}</p>
                    {source && <p className="mt-1 text-xs text-muted-foreground">Summary source: {source}</p>}
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg bg-muted/35 p-3 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    {summary || "No summary yet."}
                  </div>

                  {summary && (
                    <>
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={learningForm.category} onValueChange={(value) => setLearningForm((prev) => ({ ...prev, category: value }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {learningCategories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={learningForm.status} onValueChange={(value) => setLearningForm((prev) => ({ ...prev, status: value }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {learningStatuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="flex items-center gap-2"><NotebookText className="h-4 w-4 text-primary" />Takeaways</Label>
                          <Textarea
                            value={learningForm.takeawaysText}
                            onChange={(event) => setLearningForm((prev) => ({ ...prev, takeawaysText: event.target.value }))}
                            className="min-h-[110px]"
                            placeholder="One takeaway per line"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Notes</Label>
                          <Textarea
                            value={learningForm.notes}
                            onChange={(event) => setLearningForm((prev) => ({ ...prev, notes: event.target.value }))}
                            className="min-h-[90px]"
                            placeholder="Why this matters, what to revisit, what felt useful..."
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-primary" />Next action</Label>
                          <Input
                            value={learningForm.nextAction}
                            onChange={(event) => setLearningForm((prev) => ({ ...prev, nextAction: event.target.value }))}
                            placeholder="Example: Try this workflow tomorrow morning"
                          />
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button onClick={() => saveLearningItem(selectedVideo, summary, source)} loading={savingLearning}>
                          {isSaved(selectedVideo.id) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                          {isSaved(selectedVideo.id) ? "Update Learning" : "Save Learning"}
                        </Button>
                        <Button variant="outline" onClick={createReminderFromLearning} loading={creatingReminder}>
                          <ListTodo className="h-4 w-4" />
                          Create Reminder
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const savedContent = (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={savedSearch}
              onChange={(event) => setSavedSearch(event.target.value)}
              className="pl-9"
              placeholder="Search saved learning, notes, next actions..."
            />
          </div>
        </CardContent>
      </Card>

      {filteredSavedSummaries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center text-muted-foreground">
            <Bookmark className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-semibold text-foreground">{savedSummaries.length === 0 ? "No saved learning yet" : "No matches found"}</p>
            <p className="mt-1 text-sm">{savedSummaries.length === 0 ? "Summarize a video and save it for later" : "Try a different search term"}</p>
          </CardContent>
        </Card>
      ) : (
        filteredSavedSummaries.map((saved) => (
          <Card key={saved.videoId}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold">{saved.title}</p>
                  <p className="text-xs text-muted-foreground">{saved.channelTitle} · Saved {formatAppDate(saved.savedAt, { day: "2-digit", month: "short", year: "numeric" })}</p>
                </div>
                <button type="button" onClick={() => removeSaved(saved.videoId)} className="shrink-0 text-muted-foreground transition-colors hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{categoryLabel(saved.category)}</Badge>
                <Badge variant="outline">{statusLabel(saved.status)}</Badge>
                {saved.source && <Badge variant="outline">{saved.source}</Badge>}
              </div>

              {saved.takeaways && saved.takeaways.length > 0 && (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Takeaways</p>
                  <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {saved.takeaways.map((item, index) => <li key={`${saved.videoId}-${index}`}>- {item}</li>)}
                  </ul>
                </div>
              )}

              {saved.notes && (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{saved.notes}</p>
                </div>
              )}

              {saved.nextAction && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Next action</p>
                  <p className="text-sm text-foreground">{saved.nextAction}</p>
                </div>
              )}

              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {saved.summary}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">YT Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest videos from your subscriptions, with notes, reminders, and saved takeaways.</p>
          </div>
          <Button variant="outline" onClick={loadSubscriptionFeed} disabled={loadingSubscriptions || loadingVideos}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingSubscriptions ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </FadeIn>

      <div className="flex gap-2">
        <Button variant={activeTab === "feed" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("feed")}>
          Feed <Badge variant="secondary" className="ml-1.5">{videos.length}</Badge>
        </Button>
        <Button variant={activeTab === "saved" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("saved")}>
          <Bookmark className="mr-1 h-3.5 w-3.5" />Saved <Badge variant="outline" className="ml-1.5">{savedSummaries.length}</Badge>
        </Button>
      </div>

      {activeTab === "feed" ? feedContent : savedContent}
    </div>
  );
}
