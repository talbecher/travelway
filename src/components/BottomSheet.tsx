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
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-card border-t border-border max-h-[92vh] flex flex-col outline-none">
          <div className="pt-3 pb-2 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>
          {title && (
            <>
              <Drawer.Title className="px-5 pb-2 text-lg font-medium text-right">{title}</Drawer.Title>
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            </>
          )}
          <div className="px-5 pb-8 overflow-y-auto">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
