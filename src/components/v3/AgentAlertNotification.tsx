import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { X, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AgentAlert } from "@/hooks/useAgentAlerts";

export default function AgentAlertNotification({
  alert,
  onDismiss,
}: {
  alert: AgentAlert | null;
  onDismiss: () => void;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (alert) {
      // Small delay so drawer animates in
      const timer = setTimeout(() => setOpen(true), 300);
      return () => clearTimeout(timer);
    } else {
      setOpen(false);
    }
  }, [alert]);

  if (!alert) return null;

  const handleClose = () => {
    setOpen(false);
    setTimeout(onDismiss, 300);
  };

  const handleGoToChat = () => {
    setOpen(false);
    setTimeout(() => {
      onDismiss();
      navigate("/agent");
    }, 300);
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && handleClose()}>
      <DrawerContent className="mx-2 mb-2 rounded-2xl">
        <div className="px-5 py-5 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <Avatar className="w-12 h-12 border-2 border-primary/20 shrink-0">
              {alert.slot.avatar_url ? (
                <AvatarImage src={alert.slot.avatar_url} alt={alert.artistName} className="object-cover" />
              ) : (
                <AvatarFallback className="bg-primary/20 text-primary text-lg">
                  {alert.emoji}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-bold animate-pulse">
                  {t("alert.liveAlert")}
                </span>
              </div>
              <p className="text-base font-bold text-foreground">{alert.title}</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{alert.body}</p>
            </div>
            <button
              onClick={handleClose}
              className="shrink-0 p-1 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 h-10 rounded-xl bg-muted text-sm font-semibold text-foreground transition-colors hover:bg-muted/80"
            >
              {t("alert.dismiss")}
            </button>
            <button
              onClick={handleGoToChat}
              className="flex-1 h-10 rounded-xl bg-primary text-sm font-semibold text-primary-foreground flex items-center justify-center gap-1.5 transition-colors hover:bg-primary/90"
            >
              <MessageCircle className="w-4 h-4" />
              {t("alert.viewInChat")}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
