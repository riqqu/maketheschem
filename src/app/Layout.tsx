// The app's frame, shared by the pixel art and 3D model workspaces.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 4 4" aria-hidden="true" shapeRendering="crispEdges">
      <rect width="2" height="2" fill="#35a7c4" />
      <rect x="2" width="2" height="2" fill="#f0b020" />
      <rect y="2" width="2" height="2" fill="#a03030" />
      <rect x="2" y="2" width="2" height="2" fill="#508030" />
    </svg>
  );
}

/** Top bar, settings on the left, the workspace in the middle and tabs on the right. Stacks on narrow screens. */
export function AppLayout({ modeSwitch, actions, left, main, right }: { modeSwitch: ReactNode; actions?: ReactNode; left: ReactNode; main: ReactNode; right: ReactNode }) {
  return (
    <div className="grid h-dvh grid-cols-[280px_minmax(0,1fr)_300px] grid-rows-[48px_minmax(0,1fr)] max-[900px]:flex max-[900px]:h-auto max-[900px]:min-h-dvh max-[900px]:flex-col">
      <header className="col-span-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b px-4 max-[900px]:h-12">
        <div className="flex items-center gap-2.5 font-semibold">
          <Logo />
          <span className="max-[560px]:hidden">Make the Schem</span>
        </div>
        {modeSwitch}
        <div className="flex justify-end">{actions}</div>
      </header>
      <aside className="min-h-0 overflow-y-auto border-r max-[900px]:border-r-0">{left}</aside>
      <main className="flex min-h-0 min-w-0 flex-col max-[900px]:h-[75vh] max-[900px]:border-y">{main}</main>
      <aside className="flex min-h-0 flex-col overflow-hidden border-l max-[900px]:overflow-visible max-[900px]:border-l-0">{right}</aside>
    </div>
  );
}

export type SideTab = 'blocks' | 'materials' | 'history';

/** The right sidebar: which blocks to use, what the build needs, and saved builds. */
export function SideTabs({ tab, setTab, blocks, materials, history }: { tab: SideTab; setTab: (t: SideTab) => void; blocks: ReactNode; materials: ReactNode; history: ReactNode | null }) {
  const content = 'mt-0 min-h-0 flex-1 overflow-y-auto max-[900px]:overflow-visible';
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SideTab)} className="min-h-0 flex-1 gap-0">
      <TabsList variant="line" className="h-12! w-full shrink-0 justify-start gap-4 rounded-none border-b px-4">
        <TabsTrigger value="blocks" className="flex-none px-0">
          Blocks
        </TabsTrigger>
        <TabsTrigger value="materials" className="flex-none px-0">
          Materials
        </TabsTrigger>
        {history && (
          <TabsTrigger value="history" className="flex-none px-0">
            History
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="blocks" className={content}>
        {blocks}
      </TabsContent>
      <TabsContent value="materials" className={content}>
        {materials}
      </TabsContent>
      {history && (
        <TabsContent value="history" className={content}>
          {history}
        </TabsContent>
      )}
    </Tabs>
  );
}

/** The canvas area. Children are the canvas and the overlays below. */
export function Stage({ children }: { children: ReactNode }) {
  return <div className="relative min-h-0 min-w-0 flex-1 bg-stage">{children}</div>;
}

/** Centered message over an empty stage. */
export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Icon className="size-10 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-base font-medium">{title}</p>
      {children && <div className="pointer-events-auto flex gap-2">{children}</div>}
    </div>
  );
}

/** Floats over the top of the stage, so it never moves the canvas. */
export function StageBanner({ children }: { children: ReactNode }) {
  return (
    <div className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-full border bg-popover py-1 pr-1 pl-4 whitespace-nowrap shadow-md">
      {children}
    </div>
  );
}

export function BusyPill({ children }: { children: ReactNode }) {
  return <div className="absolute top-3 right-3 rounded-full border bg-popover px-3 py-1 text-xs font-medium shadow-sm">{children}</div>;
}

export function StatusBar({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t px-3 text-xs whitespace-nowrap">
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">{left}</div>
      <div className="tabular-nums text-muted-foreground">{right}</div>
    </footer>
  );
}
