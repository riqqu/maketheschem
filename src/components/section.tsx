import type { ReactNode } from 'react';

/** A titled group of settings in a sidebar. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 px-4 py-4">
      <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
