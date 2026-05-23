"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { PlayCircle, RefreshCw, Sparkles, TrendingUp, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";

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

export default function YtSummaryPage() {
  const { data: session } = useSession();
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

  useEffect(() => { loadSubscriptionFeed(); }, []);

  const loadVideos = async (channel: any) => {
    setSelectedChannel(channel);
    setSelectedVideo(null);
    setSummary("");
    setSource("");
  };

  const visibleVideos = useMemo(() => (
    selectedChannel
      ? videos.filter((video) => video.channelId === selectedChannel.channelId)
      : videos
  ), [selectedChannel, videos]);

  const summarizeVideo = async (video: any) => {
    setSelectedVideo(video);
    setSummary("");
    setSource("");
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
      setSummary(data.summary ?? "");
      setSource(data.source ?? "");
    } catch {
      toast.error("Failed to summarize video");
    } finally {
      setSummarizing(false);
    }
  };

  useEffect(() => {
    if (videos.length > 0 && videoId) {
      const targetVideo = videos.find((v: any) => v.id === videoId);
      if (targetVideo) {
        summarizeVideo(targetVideo);
      }
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
            <Button
              onClick={() =>
                signIn(
                  "google",
                  { callbackUrl: "/yt-summary" },
                  {
                    scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly",
                    access_type: "offline",
                    prompt: "consent",
                    login_hint: session?.user?.email ?? undefined,
                  } as any
                )
              }
              className="w-full"
            >
              Connect YouTube with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">YT Summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest videos from your subscriptions, newest first, with focused summaries.</p>
          </div>
          <Button variant="outline" onClick={loadSubscriptionFeed} disabled={loadingSubscriptions || loadingVideos}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingSubscriptions ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </FadeIn>

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
              <div className="grid max-h-[32rem] gap-2 overflow-y-auto pr-1 ios-scroll">
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

        <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
          <Card>
            <CardHeader>
              <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  {selectedChannel ? selectedChannel.title : "Latest Subscription Videos"}
                </CardTitle>
                {visibleVideos.length > 0 && (
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{visibleVideos.filter((video) => video.kind === "video").length} videos</Badge>
                    <Badge variant="outline">{visibleVideos.filter((video) => video.kind === "short").length} shorts</Badge>
                    <Badge variant="outline">Newest first</Badge>
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
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleVideos.map((video) => (
                    <button key={video.id} type="button" onClick={() => summarizeVideo(video)} className={`overflow-hidden rounded-lg border bg-muted/30 text-left transition hover:border-primary/50 ${selectedVideo?.id === video.id ? "border-primary" : "border-border"}`}>
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
                          <Badge variant="outline">{new Date(video.publishedAt).toLocaleDateString()}</Badge>
                          {video.durationSeconds > 0 && <Badge variant="outline">{formatDuration(video.durationSeconds)}</Badge>}
                          {video.viewCount > 0 && <Badge variant="outline">{formatViews(video.viewCount)}</Badge>}
                          <Badge variant={video.kind === "video" ? "default" : "outline"}>{video.kind === "video" ? "Video" : "Short"}</Badge>
                          <Badge variant="secondary">Summarize</Badge>
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
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedVideo ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Click a video to generate a summary.</div>
              ) : summarizing ? (
                <div className="space-y-3">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">{selectedVideo.title}</p>
                    {source && <p className="mt-1 text-xs text-muted-foreground">Summary source: {source}</p>}
                  </div>
                  <div className="whitespace-pre-wrap rounded-lg bg-muted/35 p-3 text-sm leading-relaxed text-muted-foreground">
                    {summary || "No summary yet."}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
