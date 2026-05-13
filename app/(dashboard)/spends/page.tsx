"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { CreditCard, Mail, Pencil, Plus, RefreshCw, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FadeIn } from "@/components/ui/animate";

const blankForm = {
  id: "",
  merchant: "",
  amount: "",
  currency: "USD",
  category: "",
  date: new Date().toISOString().slice(0, 10),
  notes: "",
};

export default function SpendsPage() {
  const [spends, setSpends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState(blankForm);

  const loadData = async () => {
    try {
      const res = await fetch("/api/spends");
      const data = await res.json();
      setSpends(data?.spends ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totals = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSpends = spends.filter((spend) => new Date(spend.date) >= monthStart);
    const total = monthSpends.reduce((sum, spend) => sum + (spend.amount ?? 0), 0);
    const gmail = monthSpends.filter((spend) => spend.source === "gmail").length;
    return { total, count: monthSpends.length, gmail };
  }, [spends]);

  const openAdd = () => {
    setForm(blankForm);
    setDialogOpen(true);
  };

  const openEdit = (spend: any) => {
    setForm({
      id: spend.id,
      merchant: spend.merchant ?? "",
      amount: String(spend.amount ?? ""),
      currency: spend.currency ?? "USD",
      category: spend.category ?? "",
      date: new Date(spend.date ?? Date.now()).toISOString().slice(0, 10),
      notes: spend.notes ?? "",
    });
    setDialogOpen(true);
  };

  const saveSpend = async () => {
    if (!form.merchant || !form.amount) {
      toast.error("Merchant and amount are required");
      return;
    }
    try {
      const res = await fetch("/api/spends", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data?.error ?? "Failed to save spend");
        return;
      }
      toast.success(form.id ? "Spend updated" : "Spend added");
      setDialogOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save spend");
    }
  };

  const deleteSpend = async (id: string) => {
    try {
      await fetch(`/api/spends?id=${id}`, { method: "DELETE" });
      toast.success("Spend removed");
      loadData();
    } catch {
      toast.error("Failed to remove spend");
    }
  };

  const importGmail = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/spends/gmail-import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data?.needsConnection) {
          toast.error("Connect Gmail first");
          return;
        }
        toast.error(data?.error ?? "Gmail import failed");
        return;
      }
      toast.success(`Imported ${data.summary.imported} spends from ${data.summary.scanned} emails`);
      loadData();
    } catch {
      toast.error("Gmail import failed");
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <div className="space-y-4">{[1,2,3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold tracking-tight">Spends</h2>
            <p className="text-muted-foreground text-sm mt-1">Track purchases manually or import receipt-like emails from Gmail</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => signIn("google", { callbackUrl: "/spends" })}>
              <Mail className="w-4 h-4 mr-2" />Connect Gmail
            </Button>
            <Button variant="outline" onClick={importGmail} disabled={importing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${importing ? "animate-spin" : ""}`} />Import Gmail
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" />Add Spend</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{form.id ? "Edit Spend" : "Add Spend"}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Merchant</Label><Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} className="mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" /></div>
                    <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} className="mt-1" /></div>
                    <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1" placeholder="Food, travel, shopping" /></div>
                    <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" /></div>
                  <Button onClick={saveSpend} className="w-full">{form.id ? "Update Spend" : "Save Spend"}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </FadeIn>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard title="This Month" value={`${totals.total.toFixed(2)}`} detail={`${totals.count} spends`} icon={WalletCards} />
        <SummaryCard title="Gmail Imported" value={`${totals.gmail}`} detail="receipt emails this month" icon={Mail} />
        <SummaryCard title="Manual Entries" value={`${spends.filter((spend) => spend.source === "manual").length}`} detail="editable local entries" icon={CreditCard} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="w-5 h-5 text-primary" />Recent Spends</CardTitle></CardHeader>
        <CardContent>
          {spends.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">No spends yet. Add one manually or connect Gmail.</div>
          ) : (
            <div className="space-y-2">
              {spends.map((spend) => (
                <div key={spend.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{spend.merchant}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(spend.date).toLocaleDateString()} {spend.emailSubject ? `• ${spend.emailSubject}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={spend.source === "gmail" ? "secondary" : "outline"}>{spend.source}</Badge>
                    <span className="font-mono text-sm">{spend.currency} {Number(spend.amount ?? 0).toFixed(2)}</span>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(spend)} title="Edit spend">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteSpend(spend.id)} title="Delete spend">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ title, value, detail, icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
      </CardContent>
    </Card>
  );
}
