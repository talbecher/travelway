import { Drawer } from "vaul";
import type { ReactNode } from "react";

export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[1000] bg-black/40" />
        <Drawer.Content
          className="fixed bottom-0 inset-x-0 z-[1001] rounded-t-2xl bg-card border-t border-border max-h-[92dvh] flex flex-col outline-none"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="pt-2.5 pb-1.5 flex justify-center shrink-0">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
          {title && (
            <>
              <Drawer.Title className="px-5 pb-2 text-lg font-medium text-right shrink-0">{title}</Drawer.Title>
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            </>
          )}
          <div className="px-5 pb-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
