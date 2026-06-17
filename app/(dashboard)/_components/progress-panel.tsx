"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Bot, TrendingUp, Plus, Scale, Ruler, Camera, Dumbbell } from "lucide-react";
import { FadeIn } from "@/components/ui/animate";
import { toast } from "sonner";
import dynamic from "next/dynamic";

const ProgressCharts = dynamic(() => import("../progress/_components/progress-charts"), { ssr: false, loading: () => <div className="h-64 bg-muted animate-pulse rounded-lg" /> });

export function ProgressPanel() {
  const [entries, setEntries] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<any[]>([]);
  const [progressNextOffset, setProgressNextOffset] = useState(0);
  const [progressHasMore, setProgressHasMore] = useState(false);
  const [loadingMoreProgress, setLoadingMoreProgress] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ weight: "", chest: "", arms: "", waist: "", hips: "", thighs: "", notes: "" });

  const loadData = useCallback(async () => {
    try {
      const [pRes, phRes, wRes] = await Promise.all([
        fetch("/api/progress?offset=0&limit=30"),
        fetch("/api/progress-photos"),
        fetch("/api/workout-logs?limit=30"),
      ]);
      const pData = await pRes.json();
      const phData = await phRes.json();
      const wData = await wRes.json();
      setEntries(pData?.entries ?? []);
      setProgressNextOffset(pData?.nextOffset ?? (pData?.entries ?? []).length);
      setProgressHasMore(Boolean(pData?.hasMore));
      setPhotos(phData?.photos ?? []);
      setWorkoutLogs(wData?.logs ?? []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMoreProgress = async () => {
    if (loadingMoreProgress || !progressHasMore) return;
    setLoadingMoreProgress(true);
    try {
      const res = await fetch(`/api/progress?offset=${progressNextOffset}&limit=30`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to load more progress");
        return;
      }
      setEntries((prev) => [...(data?.entries ?? []), ...prev]);
      setProgressNextOffset(data?.nextOffset ?? progressNextOffset + (data?.entries ?? []).length);
      setProgressHasMore(Boolean(data?.hasMore));
    } catch {
      toast.error("Failed to load more progress");
    } finally {
      setLoadingMoreProgress(false);
    }
  };

  const handleAddEntry = async () => {
    if (!form.weight && !form.chest) { toast.error("Enter at least weight or a measurement"); return; }
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight: form.weight ? parseFloat(form.weight) : null,
          chest: form.chest ? parseFloat(form.chest) : null,
          arms: form.arms ? parseFloat(form.arms) : null,
          waist: form.waist ? parseFloat(form.waist) : null,
          hips: form.hips ? parseFloat(form.hips) : null,
          thighs: form.thighs ? parseFloat(form.thighs) : null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        toast.success("Progress logged!");
        setForm({ weight: "", chest: "", arms: "", waist: "", hips: "", thighs: "", notes: "" });
        setDialogOpen(false);
        loadData();
      }
    } catch { toast.error("Failed"); }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Get presigned URL
      const presignRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
      });
      const { uploadUrl, cloud_storage_path } = await presignRes.json();
      
      // Upload to S3
      const headers: Record<string, string> = { "Content-Type": file.type };
      const urlObj = new URL(uploadUrl);
      const signedHeaders = urlObj.searchParams.get("X-Amz-SignedHeaders") ?? "";
      if (signedHeaders.includes("content-disposition")) {
        headers["Content-Disposition"] = "attachment";
      }
      await fetch(uploadUrl, { method: "PUT", headers, body: file });
      
      // Save photo record
      await fetch("/api/progress-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cloudStoragePath: cloud_storage_path, isPublic: false, label: "progress" }),
      });
      
      toast.success("Photo uploaded!");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <FadeIn>
        <div className="grid gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="hidden min-w-0 sm:block">
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">Progress Tracking</h2>
            <p className="mt-1 text-sm text-muted-foreground">Monitor your gains over time</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" />Log Progress</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Log Progress</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Weight (kg)</Label><Input type="number" value={form.weight} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, weight: e.target.value})} className="mt-1" /></div>
                    <div><Label>Chest (cm)</Label><Input type="number" value={form.chest} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, chest: e.target.value})} className="mt-1" /></div>
                    <div><Label>Arms (cm)</Label><Input type="number" value={form.arms} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, arms: e.target.value})} className="mt-1" /></div>
                    <div><Label>Waist (cm)</Label><Input type="number" value={form.waist} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, waist: e.target.value})} className="mt-1" /></div>
                    <div><Label>Hips (cm)</Label><Input type="number" value={form.hips} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, hips: e.target.value})} className="mt-1" /></div>
                    <div><Label>Thighs (cm)</Label><Input type="number" value={form.thighs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, thighs: e.target.value})} className="mt-1" /></div>
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({...form, notes: e.target.value})} className="mt-1" placeholder="How you're feeling" /></div>
                  <Button onClick={handleAddEntry} className="w-full">Save Progress</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/chat">
                <Bot className="mr-2 h-4 w-4" />
                Ask AI
              </Link>
            </Button>
          </div>
        </div>
      </FadeIn>

      <Tabs defaultValue="weight" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4 lg:w-fit">
          <TabsTrigger value="weight" className="min-w-0 gap-1"><Scale className="h-4 w-4 shrink-0" />Weight</TabsTrigger>
          <TabsTrigger value="measurements" className="min-w-0 gap-1"><Ruler className="h-4 w-4 shrink-0" />Measurements</TabsTrigger>
          <TabsTrigger value="strength" className="min-w-0 gap-1"><Dumbbell className="h-4 w-4 shrink-0" />Strength</TabsTrigger>
          <TabsTrigger value="photos" className="min-w-0 gap-1"><Camera className="h-4 w-4 shrink-0" />Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="weight">
          <ProgressCharts entries={entries} type="weight" />
          {progressHasMore && <Button type="button" variant="outline" className="mt-4 w-full" onClick={loadMoreProgress} loading={loadingMoreProgress} disabled={loadingMoreProgress}>Load more progress history</Button>}
        </TabsContent>

        <TabsContent value="measurements">
          <ProgressCharts entries={entries} type="measurements" />
          {progressHasMore && <Button type="button" variant="outline" className="mt-4 w-full" onClick={loadMoreProgress} loading={loadingMoreProgress} disabled={loadingMoreProgress}>Load more progress history</Button>}
        </TabsContent>

        <TabsContent value="strength">
          <ProgressCharts entries={entries} type="strength" workoutLogs={workoutLogs} />
        </TabsContent>

        <TabsContent value="photos">
          <FadeIn>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-primary" />
                    Progress Photos
                  </CardTitle>
                  <div>
                    <input type="file" accept="image/*" id="photo-upload" className="hidden" onChange={handlePhotoUpload} />
                    <label htmlFor="photo-upload">
                      <Button asChild loading={uploading}>
                        <span><Camera className="w-4 h-4 mr-2" />Upload Photo</span>
                      </Button>
                    </label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {(photos ?? [])?.length === 0 ? (
                  <div className="text-center py-12">
                    <Camera className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">No progress photos yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {(photos ?? []).map((photo: any) => (
                      <div key={photo?.id} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted">
                        <img
                          src={photo?.url ?? ""}
                          alt={`Progress photo - ${photo?.label ?? 'progress'}`}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e: any) => { e.target.style.display = 'none'; }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                          <p className="text-white text-xs">
                            {new Date(photo?.date ?? Date.now()).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </FadeIn>
        </TabsContent>
      </Tabs>
    </div>
  );
}
