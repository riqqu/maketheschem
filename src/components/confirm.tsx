import { useSyncExternalStore } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Request {
  title: string;
  description?: string;
  /** Label of the confirming button. */
  action: string;
  destructive?: boolean;
  resolve: (ok: boolean) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Like window.confirm, as a dialog. Needs <ConfirmDialog /> mounted once. */
export function confirm(opts: Omit<Request, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    current?.resolve(false);
    current = { ...opts, resolve };
    emit();
  });
}

export function ConfirmDialog() {
  const req = useSyncExternalStore(subscribe, () => current);
  const close = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    current = null;
    emit();
  };
  return (
    <AlertDialog open={!!req} onOpenChange={(open) => !open && close(false)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          {req?.description && <AlertDialogDescription>{req.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={req?.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
            {req?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
