import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, Youtube, Instagram, Music, Twitter } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const ArtistListingRequestDialog = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ artist_name: "", youtube_url: "", instagram_url: "", tiktok_url: "", x_url: "", note: "" });

  const handleSubmit = async () => {
    if (!user) { toast.error("Please log in to submit a request."); return; }
    if (!form.artist_name.trim()) { toast.error("Artist name is required."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from("artist_listing_requests").insert({
        user_id: user.id, artist_name: form.artist_name.trim(),
        youtube_url: form.youtube_url.trim() || null, instagram_url: form.instagram_url.trim() || null,
        tiktok_url: form.tiktok_url.trim() || null, x_url: form.x_url.trim() || null, note: form.note.trim() || null,
      });
      if (error) throw error;
      toast.success("Request submitted! We'll review it soon.");
      setForm({ artist_name: "", youtube_url: "", instagram_url: "", tiktok_url: "", x_url: "", note: "" });
      setOpen(false);
    } catch (e: any) { toast.error(e.message || "Failed to submit request."); }
    finally { setLoading(false); }
  };

  if (!user) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground mb-2">{t("listing.cantFind")}</p>
        <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => toast.info("Please log in first.")}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {t("listing.request")}
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
      <p className="text-xs text-muted-foreground mb-2">{t("listing.cantFind")}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-full text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground">
            <Plus className="w-3.5 h-3.5 mr-1" /> {t("listing.request")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-lg">{t("listing.title")}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="artist_name" className="text-xs font-semibold">{t("listing.officialName")} <span className="text-red-500">*</span></Label>
              <Input id="artist_name" placeholder="e.g. BLACKPINK, BTS" value={form.artist_name}
                onChange={(e) => setForm({ ...form, artist_name: e.target.value })} maxLength={100} />
            </div>
            <div className="space-y-3">
              <Label className="text-xs font-semibold">{t("listing.socialLinks")}</Label>
              <div className="flex items-center gap-2"><Youtube className="w-4 h-4 text-red-500 shrink-0" /><Input placeholder="YouTube channel URL" value={form.youtube_url} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} maxLength={500} className="text-sm" /></div>
              <div className="flex items-center gap-2"><Instagram className="w-4 h-4 text-pink-500 shrink-0" /><Input placeholder="Instagram profile URL" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} maxLength={500} className="text-sm" /></div>
              <div className="flex items-center gap-2"><Music className="w-4 h-4 text-foreground shrink-0" /><Input placeholder="TikTok profile URL" value={form.tiktok_url} onChange={(e) => setForm({ ...form, tiktok_url: e.target.value })} maxLength={500} className="text-sm" /></div>
              <div className="flex items-center gap-2"><Twitter className="w-4 h-4 text-blue-400 shrink-0" /><Input placeholder="X (Twitter) profile URL" value={form.x_url} onChange={(e) => setForm({ ...form, x_url: e.target.value })} maxLength={500} className="text-sm" /></div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note" className="text-xs font-semibold">{t("listing.note")}</Label>
              <Textarea id="note" placeholder="Any additional info" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} rows={2} className="text-sm" />
            </div>
            <Button onClick={handleSubmit} disabled={loading || !form.artist_name.trim()} className="w-full rounded-full">
              {loading ? t("listing.submitting") : t("listing.submitRequest")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArtistListingRequestDialog;
