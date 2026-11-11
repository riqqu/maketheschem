import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A short inline message: `warn` for problems the user should act on, `info` for facts. */
export function Note({ tone = 'warn', children, className }: { tone?: 'warn' | 'info'; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : undefined}
      className={cn(
        'rounded-md px-3 py-2 text-xs leading-relaxed',
        tone === 'warn' ? 'bg-warn text-warn-foreground' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
