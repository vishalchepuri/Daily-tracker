"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Clock3,
  Eye,
  ExternalLink,
  Filter,
  Layers3,
  ListTodo,
  NotebookText,
  PlayCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Video,
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

function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateOffsetKey(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return localDateKey(date);
}

function youtubeWatchUrl(videoId?: string | null) {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : "https://www.youtube.com";
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

const sortOptions = [
  { value: "priority", label: "Smart score" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "views", label: "Most viewed" },
  { value: "duration", label: "Longest" },
  { value: "channel", label: "Channel" },
] as const;

const priorityFilters = [
  { value: "all", label: "All" },
  { value: "must", label: "Must watch" },
  { value: "useful", label: "Useful+" },
  { value: "saved", label: "Saved" },
  { value: "unsaved", label: "Unsaved" },
] as const;

const datePresets = [
  { label: "Today", value: () => dateOffsetKey(0) },
  { label: "Yesterday", value: () => dateOffsetKey(1) },
  { label: "2 days ago", value: () => dateOffsetKey(2) },
] as const;

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const YT_CARD_CLASS = "rounded-[28px] border-border/70 bg-card/85 shadow-sm shadow-black/10";
const YT_PANEL_CLASS = "rounded-[24px] border border-border/70 bg-background/55";
const YT_INPUT_CLASS = "h-11 rounded-2xl border-border/70 bg-background/80 px-3 text-sm";

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
  const [savedCategoryFilter, setSavedCategoryFilter] = useState("all");
  const [savedStatusFilter, setSavedStatusFilter] = useState("all");
  const [feedDate, setFeedDate] = useState("");
  const [feedCachedAt, setFeedCachedAt] = useState<string | null>(null);
  const [feedFromCache, setFeedFromCache] = useState(false);
  const [contentKind, setContentKind] = useState("all");
  const [videoSearch, setVideoSearch] = useState("");
  const [sortMode, setSortMode] = useState("priority");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
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

  const loadSubscriptionFeed = async (dateOverride?: string, refresh = false) => {
    setLoadingSubscriptions(true);
    setLoadingVideos(true);
    try {
      const activeDate = dateOverride ?? feedDate;
      const params = new URLSearchParams();
      if (activeDate) params.set("date", activeDate);
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/youtube/feed${params.toString() ? `?${params.toString()}` : ""}`);
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
      setFeedCachedAt(data.cachedAt ?? null);
      setFeedFromCache(Boolean(data.cached));
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
      const result = await connectGoogleFeature(YOUTUBE_SCOPE);
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
        const result = await completeGoogleFeatureRedirect(YOUTUBE_SCOPE);
        if (!result || cancelled) return;
        if (result.scope === YOUTUBE_SCOPE) {
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
    if (!window.confirm("Delete this saved learning item? This cannot be undone.")) return;
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

  const applyFeedDate = (date: string, refresh = false) => {
    setFeedDate(date);
    void loadSubscriptionFeed(date, refresh);
  };

  const topicOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const video of videos ?? []) {
      for (const topic of video?.matchedTopics ?? []) {
        const key = String(topic ?? "").trim().toLowerCase();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));
  }, [videos]);

  const loadedDateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const video of videos ?? []) {
      const key = localDateKey(new Date(video.publishedAt));
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 8)
      .map(([value, count]) => ({ value, count }));
  }, [videos]);

  const feedStats = useMemo(() => {
    const list = videos ?? [];
    return {
      total: list.length,
      videos: list.filter((video) => video.kind === "video").length,
      shorts: list.filter((video) => video.kind === "short").length,
      mustWatch: list.filter((video) => (video.priorityScore ?? 0) >= 55).length,
      useful: list.filter((video) => (video.priorityScore ?? 0) >= 18).length,
      saved: list.filter((video) => isSaved(video.id)).length,
    };
  }, [savedSummaries, videos]);

  const visibleVideos = useMemo(() => {
    let list = selectedChannel ? videos.filter((video) => video.channelId === selectedChannel.channelId) : videos;
    if (contentKind !== "all") list = list.filter((video) => video.kind === contentKind);
    if (priorityFilter === "must") list = list.filter((video) => (video.priorityScore ?? 0) >= 55);
    if (priorityFilter === "useful") list = list.filter((video) => (video.priorityScore ?? 0) >= 18);
    if (priorityFilter === "saved") list = list.filter((video) => isSaved(video.id));
    if (priorityFilter === "unsaved") list = list.filter((video) => !isSaved(video.id));
    if (topicFilter !== "all") {
      list = list.filter((video) => (video.matchedTopics ?? []).some((topic: string) => String(topic).toLowerCase() === topicFilter));
    }
    const query = videoSearch.trim().toLowerCase();
    if (query) {
      list = list.filter((video) =>
        [
          video.title,
          video.channelTitle,
          video.description,
          video.aiReason,
          ...(video.matchedTopics ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
    }
    return [...list].sort((a, b) => {
      if (sortMode === "newest") return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      if (sortMode === "oldest") return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      if (sortMode === "views") return (b.viewCount ?? 0) - (a.viewCount ?? 0);
      if (sortMode === "duration") return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
      if (sortMode === "channel") return String(a.channelTitle ?? "").localeCompare(String(b.channelTitle ?? ""));
      return (b.priorityScore ?? 0) - (a.priorityScore ?? 0) || new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }, [contentKind, priorityFilter, savedSummaries, selectedChannel, sortMode, topicFilter, videoSearch, videos]);

  const filteredSavedSummaries = useMemo(() => {
    const query = savedSearch.trim().toLowerCase();
    return savedSummaries.filter((item) => {
      if (savedCategoryFilter !== "all" && item.category !== savedCategoryFilter) return false;
      if (savedStatusFilter !== "all" && item.status !== savedStatusFilter) return false;
      if (!query) return true;
      return (
      [item.title, item.channelTitle, item.summary, item.notes, item.nextAction, ...(item.takeaways ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(query)
      );
    }).sort((a, b) => new Date(b.updatedAt ?? b.savedAt).getTime() - new Date(a.updatedAt ?? a.savedAt).getTime());
  }, [savedCategoryFilter, savedSearch, savedStatusFilter, savedSummaries]);

  const summarizeVideo = async (video: any, options: { refresh?: boolean } = {}) => {
    setSelectedVideo(video);
    setSummary("");
    setSource("");
    const existing = savedSummaries.find((item) => item.videoId === video.id);
    if (existing && !options.refresh) {
      setSummary(existing.summary ?? "");
      setSource(existing.source ?? "saved summary");
      hydrateLearningForm(video, existing.summary, existing.source ?? "saved summary", existing.takeaways ?? []);
      return;
    }
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
        <Card className={`${YT_CARD_CLASS} max-w-xl border-primary/30`}>
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
            <Button onClick={connectYoutube} className="h-12 w-full rounded-2xl" loading={connectingYoutube} disabled={connectingYoutube}>
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
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-[22px] border px-3 py-2 text-sm ${importHealth.youtube.needsReconnect ? "border-amber-500/40 bg-amber-500/10" : "border-primary/20 bg-primary/5"}`}>
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
        <Card className={`${YT_CARD_CLASS} border-amber-500/40 bg-amber-500/10`}>
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Loaded", value: feedStats.total, icon: Layers3 },
          { label: "Must watch", value: feedStats.mustWatch, icon: Sparkles },
          { label: "Videos", value: feedStats.videos, icon: Video },
          { label: "Shorts", value: feedStats.shorts, icon: PlayCircle },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-[24px] border border-border/70 bg-card/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold">{item.value}</p>
            </div>
          );
        })}
      </div>

      <Card className={YT_CARD_CLASS}>
        <CardContent className="space-y-4 p-3 sm:p-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] xl:items-end">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
                Get by date
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,15rem)_auto_auto_auto] sm:items-center">
                <Input
                  type="date"
                  value={feedDate}
                  onChange={(event) => setFeedDate(event.target.value)}
                  className={YT_INPUT_CLASS}
                />
                <Button type="button" onClick={() => loadSubscriptionFeed()} loading={loadingVideos} className="h-11 rounded-2xl">
                  Load
                </Button>
                <Button type="button" variant="outline" onClick={() => loadSubscriptionFeed(undefined, true)} loading={loadingVideos} className="h-11 rounded-2xl">
                  Refresh
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFeedDate("");
                    void loadSubscriptionFeed("");
                  }}
                  className="h-11 rounded-2xl"
                >
                  Latest
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {datePresets.map((preset) => {
                  const value = preset.value();
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyFeedDate(value)}
                      className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition active:scale-[0.98] ${
                        feedDate === value ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-background/70 text-muted-foreground"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              {loadedDateOptions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dates in loaded feed</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {loadedDateOptions.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => applyFeedDate(item.value)}
                        className={`h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition active:scale-[0.98] ${
                          feedDate === item.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-background/70 text-muted-foreground"
                        }`}
                      >
                        {formatAppDate(`${item.value}T00:00:00.000Z`, { day: "2-digit", month: "short" })} ({item.count})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-[22px] border border-border/70 bg-background/55 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cache</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {feedCachedAt
                  ? `${feedFromCache ? "Using saved feed" : "Saved fresh feed"} for ${feedDate || "latest subscriptions"} at ${formatAppDate(feedCachedAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.`
                  : "No feed loaded yet."}
              </p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_14rem_12rem] xl:items-end">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Search className="h-4 w-4 text-primary" />
                Search videos
              </Label>
              <Input
                value={videoSearch}
                onChange={(event) => setVideoSearch(event.target.value)}
                className={YT_INPUT_CLASS}
                placeholder="Search title, channel, topic, reason..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                Sort
              </Label>
              <Select value={sortMode} onValueChange={setSortMode}>
                <SelectTrigger className={YT_INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Filter className="h-4 w-4 text-primary" />
                Topic
              </Label>
              <Select value={topicFilter} onValueChange={setTopicFilter}>
                <SelectTrigger className={YT_INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All topics</SelectItem>
                  {topicOptions.map((topic) => <SelectItem key={topic.value} value={topic.value}>{topic.value} ({topic.count})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {priorityFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPriorityFilter(item.value)}
                  className={`h-10 shrink-0 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.98] ${
                    priorityFilter === item.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-background/70 text-muted-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "all", label: "All" },
                { value: "video", label: "Videos" },
                { value: "short", label: "Shorts" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setContentKind(item.value)}
                  className={`h-10 rounded-2xl border px-3 text-sm font-semibold transition active:scale-[0.98] ${
                    contentKind === item.value ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-background/70 text-muted-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <Card className={YT_CARD_CLASS}>
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
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChannel(null);
                    setSelectedVideo(null);
                    setSummary("");
                    setSource("");
                  }}
                  className={`grid grid-cols-[3rem_1fr] items-center gap-3 rounded-[20px] p-2 text-left transition active:scale-[0.99] hover:bg-muted ${!selectedChannel ? "bg-primary/10 text-primary" : "bg-muted/35"}`}
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
                    className={`grid grid-cols-[3rem_1fr] items-center gap-3 rounded-[20px] p-2 text-left transition active:scale-[0.99] hover:bg-muted ${selectedChannel?.channelId === channel.channelId ? "bg-primary/10 text-primary" : "bg-muted/35"}`}
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
          <Card className={YT_CARD_CLASS}>
            <CardHeader>
              <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
                <CardTitle className="flex min-w-0 items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  <span className="min-w-0 truncate">{selectedChannel ? selectedChannel.title : "Latest Subscription Videos"}</span>
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{visibleVideos.length} showing</Badge>
                  <Badge variant="outline">{visibleVideos.filter((video) => video.kind === "video").length} videos</Badge>
                  <Badge variant="outline">{visibleVideos.filter((video) => video.kind === "short").length} shorts</Badge>
                  {(videoSearch || contentKind !== "all" || priorityFilter !== "all" || topicFilter !== "all" || selectedChannel) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={() => {
                        setVideoSearch("");
                        setContentKind("all");
                        setPriorityFilter("all");
                        setTopicFilter("all");
                        setSelectedChannel(null);
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingVideos ? (
                <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
              ) : visibleVideos.length === 0 ? (
                <div className="rounded-[24px] border border-dashed p-8 text-center text-sm text-muted-foreground">
                  <Filter className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                  <p className="font-semibold text-foreground">No videos match these filters</p>
                  <p className="mt-1">Try Latest, clear filters, or pick a different date.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleVideos.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => summarizeVideo(video)}
                      className={`group overflow-hidden rounded-[26px] border bg-background/55 text-left shadow-sm shadow-black/5 transition active:scale-[0.99] hover:border-primary/50 hover:bg-muted/20 ${selectedVideo?.id === video.id ? "border-primary ring-1 ring-primary/30" : "border-border/70"}`}
                    >
                      <div className="relative">
                        {video.thumbnail ? <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-muted" />}
                        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                          <Badge variant={video.kind === "video" ? "default" : "outline"} className="bg-background/90 backdrop-blur">
                            {video.kind === "video" ? "Video" : "Short"}
                          </Badge>
                          {video.durationSeconds > 0 && (
                            <Badge variant="outline" className="bg-background/90 backdrop-blur">
                              <Clock3 className="mr-1 h-3 w-3" />
                              {formatDuration(video.durationSeconds)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={(video.priorityScore ?? 0) >= 35 ? "default" : "secondary"} className="gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {priorityLabel(video.priorityScore)}
                          </Badge>
                          <span className="rounded-full border border-border bg-background/70 px-2 py-1 font-mono text-xs text-muted-foreground">
                            {video.priorityScore ?? 0}/100
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, video.priorityScore ?? 0))}%` }} />
                        </div>
                        <div>
                          <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">{video.title}</p>
                          <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{video.channelTitle}</p>
                        </div>
                        {video.aiReason && (
                          <p className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            {video.aiReason}
                          </p>
                        )}
                        {video.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{video.description}</p>}
                        {video.matchedTopics?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {video.matchedTopics.slice(0, 4).map((topic: string) => (
                              <Badge key={topic} variant="outline" className="text-[10px] capitalize">{topic}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{formatAppDate(video.publishedAt, { day: "2-digit", month: "short", year: "numeric" })}</Badge>
                          {video.viewCount > 0 && <Badge variant="outline"><Eye className="mr-1 h-3 w-3" />{formatViews(video.viewCount)}</Badge>}
                          {isSaved(video.id) && <Badge variant="secondary" className="gap-1 text-primary"><BookmarkCheck className="h-2.5 w-2.5" />Saved</Badge>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={`${YT_CARD_CLASS} xl:sticky xl:top-4 xl:self-start`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Learning Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedVideo ? (
                <div className="rounded-[22px] border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <Sparkles className="mx-auto mb-3 h-9 w-9 text-muted-foreground/35" />
                  <p className="font-semibold text-foreground">Choose a video</p>
                  <p className="mt-1">Dayza will show the saved summary instantly, or generate a new one when needed.</p>
                </div>
              ) : summarizing ? (
                <div className="space-y-3">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[22px] border border-border/70 bg-background/55">
                    {selectedVideo.thumbnail && <img src={selectedVideo.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                    <div className="space-y-3 p-3">
                      <div>
                        <p className="line-clamp-3 text-sm font-semibold leading-snug">{selectedVideo.title}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{selectedVideo.channelTitle}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={(selectedVideo.priorityScore ?? 0) >= 35 ? "default" : "secondary"}>
                          Score {selectedVideo.priorityScore ?? 0}
                        </Badge>
                        <Badge variant="outline">{selectedVideo.kind === "video" ? "Video" : "Short"}</Badge>
                        {selectedVideo.durationSeconds > 0 && <Badge variant="outline">{formatDuration(selectedVideo.durationSeconds)}</Badge>}
                        <Badge variant="outline">{formatAppDate(selectedVideo.publishedAt, { day: "2-digit", month: "short" })}</Badge>
                      </div>
                      {selectedVideo.aiReason && (
                        <p className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                          {selectedVideo.aiReason}
                        </p>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button type="button" variant="outline" asChild className="h-10 rounded-2xl">
                          <a href={youtubeWatchUrl(selectedVideo.id)} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </a>
                        </Button>
                        <Button type="button" variant="outline" className="h-10 rounded-2xl" onClick={() => summarizeVideo(selectedVideo, { refresh: true })} loading={summarizing}>
                          <RefreshCw className="h-4 w-4" />
                          Refresh AI
                        </Button>
                      </div>
                    </div>
                  </div>
                  {source && <p className="text-xs text-muted-foreground">Summary source: {source}</p>}
                  <div className="whitespace-pre-wrap rounded-[22px] bg-muted/35 p-3 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    {summary || "No summary yet."}
                  </div>

                  {summary && (
                    <>
                      <div className="grid gap-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={learningForm.category} onValueChange={(value) => setLearningForm((prev) => ({ ...prev, category: value }))}>
                              <SelectTrigger className={YT_INPUT_CLASS}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {learningCategories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={learningForm.status} onValueChange={(value) => setLearningForm((prev) => ({ ...prev, status: value }))}>
                              <SelectTrigger className={YT_INPUT_CLASS}><SelectValue /></SelectTrigger>
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
                            className="min-h-[110px] rounded-2xl border-border/70 bg-background/80"
                            placeholder="One takeaway per line"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label>Notes</Label>
                          <Textarea
                            value={learningForm.notes}
                            onChange={(event) => setLearningForm((prev) => ({ ...prev, notes: event.target.value }))}
                            className="min-h-[90px] rounded-2xl border-border/70 bg-background/80"
                            placeholder="Why this matters, what to revisit, what felt useful..."
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="flex items-center gap-2"><ListTodo className="h-4 w-4 text-primary" />Next action</Label>
                          <Input
                            value={learningForm.nextAction}
                            onChange={(event) => setLearningForm((prev) => ({ ...prev, nextAction: event.target.value }))}
                            className={YT_INPUT_CLASS}
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
      <Card className={YT_CARD_CLASS}>
        <CardContent className="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Search className="h-4 w-4 text-primary" />
                Search saved learning
              </Label>
              <Input
                value={savedSearch}
                onChange={(event) => setSavedSearch(event.target.value)}
                className={YT_INPUT_CLASS}
                placeholder="Search notes, takeaways, next actions..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={savedCategoryFilter} onValueChange={setSavedCategoryFilter}>
                <SelectTrigger className={YT_INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {learningCategories.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={savedStatusFilter} onValueChange={setSavedStatusFilter}>
                <SelectTrigger className={YT_INPUT_CLASS}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {learningStatuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl"
              onClick={() => {
                setSavedSearch("");
                setSavedCategoryFilter("all");
                setSavedStatusFilter("all");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredSavedSummaries.length === 0 ? (
        <Card className={YT_CARD_CLASS}>
          <CardContent className="flex flex-col items-center py-12 text-center text-muted-foreground">
            <Bookmark className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-semibold text-foreground">{savedSummaries.length === 0 ? "No saved learning yet" : "No matches found"}</p>
            <p className="mt-1 text-sm">{savedSummaries.length === 0 ? "Summarize a video and save it for later" : "Try a different search term"}</p>
          </CardContent>
        </Card>
      ) : (
        filteredSavedSummaries.map((saved) => (
          <Card key={saved.videoId} className={YT_CARD_CLASS}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold">{saved.title}</p>
                  <p className="text-xs text-muted-foreground">{saved.channelTitle} - Saved {formatAppDate(saved.savedAt, { day: "2-digit", month: "short", year: "numeric" })}</p>
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
                <div className={`${YT_PANEL_CLASS} p-3`}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Takeaways</p>
                  <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                    {saved.takeaways.map((item, index) => <li key={`${saved.videoId}-${index}`}>- {item}</li>)}
                  </ul>
                </div>
              )}

              {saved.notes && (
                <div className={`${YT_PANEL_CLASS} p-3`}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{saved.notes}</p>
                </div>
              )}

              {saved.nextAction && (
                <div className="rounded-[22px] border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Next action</p>
                  <p className="text-sm text-foreground">{saved.nextAction}</p>
                </div>
              )}

              <div className="whitespace-pre-wrap rounded-[22px] bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {saved.summary}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  return (
    <div className="w-full max-w-full space-y-5 overflow-x-hidden sm:space-y-6">
      <FadeIn>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">YT Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest videos from your subscriptions, with notes, reminders, and saved takeaways.</p>
          </div>
          <Button variant="outline" className="h-11 rounded-2xl" onClick={() => loadSubscriptionFeed(undefined, true)} disabled={loadingSubscriptions || loadingVideos}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingSubscriptions ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </FadeIn>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/30 p-1 sm:inline-grid sm:w-auto">
        <Button variant={activeTab === "feed" ? "default" : "ghost"} size="sm" className="h-10 rounded-xl" onClick={() => setActiveTab("feed")}>
          Feed <Badge variant="secondary" className="ml-1.5">{videos.length}</Badge>
        </Button>
        <Button variant={activeTab === "saved" ? "default" : "ghost"} size="sm" className="h-10 rounded-xl" onClick={() => setActiveTab("saved")}>
          <Bookmark className="mr-1 h-3.5 w-3.5" />Saved <Badge variant="outline" className="ml-1.5">{savedSummaries.length}</Badge>
        </Button>
      </div>

      {activeTab === "feed" ? feedContent : savedContent}
    </div>
  );
}
