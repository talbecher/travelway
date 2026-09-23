import { Drawer } from "vaul";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type BottomSheetFooterContextValue = {
  target: HTMLDivElement | null;
  register: () => () => void;
};

const BottomSheetFooterContext = createContext<BottomSheetFooterContextValue | null>(null);

export function BottomSheetFooter({ children }: { children: ReactNode }) {
  const context = useContext(BottomSheetFooterContext);

  useEffect(() => context?.register(), [context]);

  if (!context?.target) return null;
  return createPortal(children, context.target);
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  contentClassName,
  bodyClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  description?: string;
  footer?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const [portalFooterCount, setPortalFooterCount] = useState(0);
  // Each open/close cycle gets a fresh Vaul instance, so keyboard-height refs
  // (initial height, previous viewport diff) never leak into the next opening.
  const [cycle, setCycle] = useState(0);
  const footerContext = useMemo<BottomSheetFooterContextValue>(() => ({
    target: footerTarget,
    register: () => {
      setPortalFooterCount((count) => count + 1);
      return () => setPortalFooterCount((count) => Math.max(0, count - 1));
    },
  }), [footerTarget]);
  const hasFooter = footer != null || portalFooterCount > 0;

  return (
    <Drawer.Root
      key={cycle}
      open={open}
      onOpenChange={onOpenChange}
      direction="bottom"
      repositionInputs
      onAnimationEnd={(isOpen) => {
        if (!isOpen) setCycle((c) => c + 1);
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[1000] bg-black/40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[1001] flex max-h-[92dvh] w-full max-w-full min-w-0 flex-col rounded-t-2xl border-t border-border bg-surface outline-none",
            contentClassName,
          )}
        >
          <BottomSheetFooterContext.Provider value={footerContext}>
            <header className="shrink-0">
              <div className="flex justify-center pb-1.5 pt-2.5">
                <div className="h-1 w-10 rounded-full bg-border-strong" />
              </div>
              {title && (
                <Drawer.Title className="px-4 pb-2 text-right text-base font-medium">{title}</Drawer.Title>
              )}
              <Drawer.Description className="sr-only">
                {description ?? title ?? "חלון פעולות"}
              </Drawer.Description>
            </header>
            <div
              className={cn(
                "min-h-0 min-w-0 flex-1 max-w-full overflow-y-auto overscroll-contain px-4",
                hasFooter ? "pb-4" : "pb-[calc(1rem+env(safe-area-inset-bottom))]",
                bodyClassName,
              )}
            >
              {children}
            </div>
            <div
              ref={setFooterTarget}
              className={cn(
                "min-w-0 shrink-0 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
                !hasFooter && "hidden",
              )}
            >
              {footer}
            </div>
          </BottomSheetFooterContext.Provider>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
