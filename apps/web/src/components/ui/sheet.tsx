import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** Bottom sheet used for every form: thumb-reachable, glassy, native-feeling on mobile. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'glass fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[2rem] outline-none',
            'bg-card/95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-foreground/20" />
          <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-3">
            <div>
              <Dialog.Title className="text-xl font-extrabold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="text-sm text-muted-foreground">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="rounded-full bg-foreground/[0.08] p-2 text-muted-foreground" aria-label={t('Close')}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="pb-safe overflow-y-auto px-5 pb-6 pt-3">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
