import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Coins, Sparkles, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface KPointsPurchaseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PACKAGES = [
  { key: "100",  points: 100,  price: "$1.00", icon: Coins,    color: "text-amber-400",  label: "Starter",  bonus: null },
  { key: "600",  points: 600,  price: "$5.00", icon: Sparkles, color: "text-blue-400",   label: "Popular",  bonus: "+20%" },
  { key: "1500", points: 1500, price: "$10.00", icon: Zap,     color: "text-purple-400", label: "Best Value", bonus: "+50%" },
];

const KPointsPurchaseDrawer = ({ open, onOpenChange }: KPointsPurchaseDrawerProps) => {
  const { user, session, kPoints } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (packageKey: string) => {
    if (!user || !session?.access_token || loading) return;
    setLoading(packageKey);

    try {
      const { data, error } = await supabase.functions.invoke("ktrenz-create-checkout", {
        body: { package_key: packageKey },
      });

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create checkout");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-4 mb-4 rounded-2xl bg-background border-border md:max-w-sm md:mx-auto">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            {t("points.purchaseTitle")}
          </DrawerTitle>
          <DrawerDescription asChild>
            <div className="space-y-1">
              <p>{t("points.purchaseDesc")}</p>
              <p className="text-[#2dd4bf] font-semibold">
                {t("agent.pointPurchaseBalance")}: {kPoints.toLocaleString()}P
              </p>
            </div>
          </DrawerDescription>
        </DrawerHeader>

        <div className="grid gap-2.5 px-4 py-2">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            const isLoading = loading === pkg.key;
            return (
              <button
                key={pkg.key}
                disabled={!!loading}
                onClick={() => handlePurchase(pkg.key)}
                className={cn(
                  "relative flex items-center gap-3 w-full px-4 py-3.5 rounded-xl border transition-all text-left",
                  "border-border hover:border-primary/40 hover:bg-primary/5",
                  isLoading && "opacity-70",
                )}
              >
                {pkg.bonus && (
                  <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    {pkg.bonus}
                  </span>
                )}
                <div className={cn("w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0")}>
                  <Icon className={cn("w-4.5 h-4.5", pkg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold text-foreground">{pkg.points.toLocaleString()}P</span>
                    <span className="text-xs text-muted-foreground">{pkg.label}</span>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">{pkg.price}</span>
                </div>
                <div className="shrink-0">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  ) : (
                    <span className="text-xs font-semibold text-primary">{t("agent.bundleBuy")}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline" disabled={!!loading}>{t("agent.clearChatCancel")}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default KPointsPurchaseDrawer;
