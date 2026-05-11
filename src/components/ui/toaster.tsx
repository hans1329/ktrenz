import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, duration, ...props }) {
        // Default duration: 4s with action, 2.5s without. Caller can still
        // override per-call (e.g. PWAUpdatePrompt sets Infinity to keep the
        // update prompt sticky until the user taps).
        const effectiveDuration = duration ?? (action ? 4000 : 2500);
        return (
          <Toast key={id} duration={effectiveDuration} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
