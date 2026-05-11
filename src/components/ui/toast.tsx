import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col items-center p-4 md:max-w-[480px] md:left-1/2 md:-translate-x-1/2",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-2xl border px-5 py-6 pr-10 shadow-lg backdrop-blur-xl transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-top-full data-[state=open]:slide-in-from-top-full",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-gradient-to-r from-primary/60 via-primary/50 to-accent/40 text-white shadow-[0_8px_32px_hsl(var(--primary)/0.2)]",
        destructive: "border-destructive/25 bg-gradient-to-r from-destructive/60 via-destructive/50 to-destructive/40 text-white shadow-[0_8px_32px_hsl(var(--destructive)/0.2)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, onPointerDown, onPointerUp, onClick, ...props }, ref) => {
  // Mobile double-tap workaround. Radix Toast's swipe-to-dismiss tracker
  // attaches to Toast.Root and consumes the first pointer event as a
  // potential drag-start, so the button's native onClick fires only on the
  // second tap. We:
  //   1. stopPropagation on pointerdown to keep the swipe tracker quiet
  //   2. fire the user-supplied onClick from pointerup as a fallback
  //   3. guard with a one-shot ref so we don't double-fire (pointerup +
  //      native click in the same gesture).
  const firedRef = React.useRef(false);
  return (
    <ToastPrimitives.Action
      ref={ref}
      onPointerDown={(e) => {
        e.stopPropagation();
        firedRef.current = false;
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (!firedRef.current) {
          firedRef.current = true;
          // Fire user's onClick via the pointerup path. Setting timeout 0
          // lets any React state updates inside the handler queue cleanly.
          if (onClick) {
            // synthesize a click-like target
            const synthetic = e as unknown as React.MouseEvent<HTMLButtonElement>;
            onClick(synthetic);
          }
        }
        onPointerUp?.(e);
      }}
      onClick={(e) => {
        // Native click also fires after pointerup completes. Guard to avoid
        // running the user handler twice in one tap.
        if (firedRef.current) {
          e.preventDefault();
          return;
        }
        firedRef.current = true;
        onClick?.(e);
      }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary hover:text-secondary-foreground group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group-[.destructive]:focus:ring-destructive disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    // Always visible on touch (no group-hover trigger on mobile).
    onPointerDown={(e) => { e.stopPropagation(); }}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-white/60 transition-opacity opacity-70 hover:opacity-100 hover:text-white focus:opacity-100 focus:outline-none",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn("text-sm font-semibold text-white", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("text-xs text-white/85", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};