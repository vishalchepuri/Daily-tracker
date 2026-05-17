"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { PlayCircle, RefreshCw, Sparkles, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";

export default function YtSummaryPage() {
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

  const loadSubscriptions = async () => {
    setLoadingSubscriptions(true);
    try {
      const res = await fetch("/api/youtube/subscriptions");
      const data = await res.json();
      if (!res.ok) {
        setNeedsConnection(Boolean(data?.needsConnection));
        if (!data?.needsConnection) toast.error(data?.error ?? "Failed to load subscriptions");
        return;
      }
      setNeedsConnection(false);
      setSubscriptions(data.subscriptions ?? []);
    } catch {
      toast.error("Failed to load subscriptions");
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  useEffect(() => { loadSubscriptions(); }, []);

  const loadVideos = async (channel: any) => {
    setSelectedChannel(channel);
    setSelectedVideo(null);
    setSummary("");
    setSource("");
    setLoadingVideos(true);
    try {
      const res = await fetch(`/api/youtube/videos?channelId=${encodeURIComponent(channel.channelId)}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load videos");
        return;
      }
      setVideos(data.videos ?? []);
    } catch {
      toast.error("Failed to load videos");
    } finally {
      setLoadingVideos(false);
    }
  };

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
        toast.error(data?.error ?? "Failed to summarize video");
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
            <Button onClick={() => signIn("google", { callbackUrl: "/yt-summary" })} className="w-full">
              Sign in with Google
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
            <p className="mt-1 text-sm text-muted-foreground">Pick a subscribed channel, choose a recent video, and get a quick summary.</p>
          </div>
          <Button variant="outline" onClick={loadSubscriptions} disabled={loadingSubscriptions}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingSubscriptions ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </FadeIn>

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
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-primary" />
                {selectedChannel ? selectedChannel.title : "Recent Videos"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedChannel ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Select a subscription to see recent videos.</div>
              ) : loadingVideos ? (
                <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>
              ) : videos.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No recent videos found.</div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {videos.map((video) => (
                    <button key={video.id} type="button" onClick={() => summarizeVideo(video)} className={`overflow-hidden rounded-lg border bg-muted/30 text-left transition hover:border-primary/50 ${selectedVideo?.id === video.id ? "border-primary" : "border-border"}`}>
                      {video.thumbnail ? <img src={video.thumbnail} alt="" className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-muted" />}
                      <div className="space-y-2 p-3">
                        <p className="line-clamp-2 text-sm font-semibold">{video.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{new Date(video.publishedAt).toLocaleDateString()}</Badge>
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
