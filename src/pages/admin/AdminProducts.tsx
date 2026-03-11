import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface PointPackage {
  id: string;
  package_key: string;
  label: string;
  points: number;
  price_cents: number;
  currency: string;
  stripe_price_id: string;
  bonus_label: string | null;
  display_order: number;
  is_active: boolean;
}

const AdminProducts = () => {
  const queryClient = useQueryClient();
  const [editPkg, setEditPkg] = useState<PointPackage | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["admin-point-packages"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ktrenz_point_packages")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data as PointPackage[];
    },
  });

  const handleSave = async (pkg: Partial<PointPackage> & { id?: string }) => {
    setSaving(true);
    try {
      if (pkg.id) {
        const { error } = await (supabase as any)
          .from("ktrenz_point_packages")
          .update({
            package_key: pkg.package_key,
            label: pkg.label,
            points: pkg.points,
            price_cents: pkg.price_cents,
            stripe_price_id: pkg.stripe_price_id,
            bonus_label: pkg.bonus_label || null,
            display_order: pkg.display_order,
            is_active: pkg.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", pkg.id);
        if (error) throw error;
        toast.success("Package updated");
      } else {
        const { error } = await (supabase as any)
          .from("ktrenz_point_packages")
          .insert({
            package_key: pkg.package_key,
            label: pkg.label,
            points: pkg.points,
            price_cents: pkg.price_cents,
            stripe_price_id: pkg.stripe_price_id,
            bonus_label: pkg.bonus_label || null,
            display_order: pkg.display_order ?? 99,
            is_active: pkg.is_active ?? true,
          });
        if (error) throw error;
        toast.success("Package created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-point-packages"] });
      setEditPkg(null);
      setShowAdd(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this package?")) return;
    const { error } = await (supabase as any).from("ktrenz_point_packages").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-point-packages"] });
    }
  };

  const handleToggleActive = async (pkg: PointPackage) => {
    await (supabase as any)
      .from("ktrenz_point_packages")
      .update({ is_active: !pkg.is_active, updated_at: new Date().toISOString() })
      .eq("id", pkg.id);
    queryClient.invalidateQueries({ queryKey: ["admin-point-packages"] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5" /> K-토큰 상품 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Stripe를 통해 판매되는 토큰 패키지를 관리합니다</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> 패키지 추가
        </Button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Key</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Label</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Points</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Price</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bonus</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Active</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg) => (
              <tr key={pkg.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs">{pkg.package_key}</td>
                <td className="px-4 py-3">{pkg.label}</td>
                <td className="px-4 py-3 text-right font-semibold">{pkg.points.toLocaleString()}P</td>
                <td className="px-4 py-3 text-right">${(pkg.price_cents / 100).toFixed(2)}</td>
                <td className="px-4 py-3">
                  {pkg.bonus_label ? (
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">
                      {pkg.bonus_label}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Switch checked={pkg.is_active} onCheckedChange={() => handleToggleActive(pkg)} />
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditPkg(pkg)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(pkg.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {packages.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No packages configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit / Add Dialog */}
      <PackageDialog
        open={!!editPkg || showAdd}
        onOpenChange={(open) => { if (!open) { setEditPkg(null); setShowAdd(false); } }}
        pkg={editPkg}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
};

// ── Package Edit Dialog ──
function PackageDialog({
  open, onOpenChange, pkg, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pkg: PointPackage | null;
  onSave: (pkg: any) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    package_key: "",
    label: "",
    points: 100,
    price_cents: 100,
    stripe_price_id: "",
    bonus_label: "",
    display_order: 0,
    is_active: true,
  });

  // Sync form when pkg changes
  const isEdit = !!pkg;
  if (open && pkg && form.package_key !== pkg.package_key) {
    setForm({
      package_key: pkg.package_key,
      label: pkg.label,
      points: pkg.points,
      price_cents: pkg.price_cents,
      stripe_price_id: pkg.stripe_price_id,
      bonus_label: pkg.bonus_label || "",
      display_order: pkg.display_order,
      is_active: pkg.is_active,
    });
  }

  // Reset when opening for add
  const handleOpen = (v: boolean) => {
    if (v && !pkg) {
      setForm({ package_key: "", label: "", points: 100, price_cents: 100, stripe_price_id: "", bonus_label: "", display_order: 0, is_active: true });
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md rounded-2xl mx-4">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Package" : "Add Package"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Package Key</label>
              <Input value={form.package_key} onChange={(e) => setForm({ ...form, package_key: e.target.value })} placeholder="e.g. 100" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Label</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Starter" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Points</label>
              <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Price (cents)</label>
              <Input type="number" value={form.price_cents} onChange={(e) => setForm({ ...form, price_cents: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Stripe Price ID</label>
            <Input value={form.stripe_price_id} onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })} placeholder="price_..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bonus Label</label>
              <Input value={form.bonus_label} onChange={(e) => setForm({ ...form, bonus_label: e.target.value })} placeholder="+20%" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Display Order</label>
              <Input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onSave({ ...(pkg ? { id: pkg.id } : {}), ...form })} disabled={saving || !form.package_key || !form.stripe_price_id}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminProducts;
