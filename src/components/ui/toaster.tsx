import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, duration, ...props }) {
        // Default duration: 4s with action, 2.5s without. Caller can still
        // override per-call (e.g. PWAUpdatePrompt sets Infinity to keep the
        // update prompt sticky until the user taps).
        const effectiveDuration = duration ?? (action ? 4000 : 2500);
        // Radix Toast.Action does NOT auto-dismiss — only Toast.Close does.
        // Wrap action's onClick to also fire dismiss(id) so the toast
        // disappears the moment the user taps the action button (instead of
        // waiting for the timeout).
        const wrappedAction = React.isValidElement<{ onClick?: (e: React.MouseEvent) => void }>(action)
          ? React.cloneElement(action, {
              onClick: (e: React.MouseEvent) => {
                action.props.onClick?.(e);
                dismiss(id);
              },
            })
          : action;
        return (
          <Toast key={id} duration={effectiveDuration} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {wrappedAction}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
