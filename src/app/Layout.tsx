// The app's frame, shared by the pixel art and 3D model workspaces.
import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { clampSidebar, SIDEBAR_LIMITS, SIDEBAR_MAX_SHARE, type Side } from '../core/sidebar';
import { resetSidebarWidth, setSidebarWidth, useSidebarWidths, useViewportWidth } from './useSidebarWidths';

function Logo() {
  return <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={24} height={24} className="size-6 shrink-0" />;
}

const KEY_STEP = 16;

/** The draggable edge of a sidebar. Arrow keys nudge it, a double click puts it back. Sits over the seam, so it takes no room. */
function SidebarHandle({ side }: { side: Side }) {
  const width = clampSidebar(side, useSidebarWidths()[side], useViewportWidth());
  const { min, max } = SIDEBAR_LIMITS[side];
  // Dragging the left edge to the right widens the left sidebar; the right sidebar is the other way round.
  const grow = side === 'left' ? 1 : -1;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Resize left sidebar' : 'Resize right sidebar'}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const frame = e.currentTarget.parentElement!.getBoundingClientRect();
        setSidebarWidth(side, side === 'left' ? e.clientX - frame.left : frame.right - e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = (e.shiftKey ? 4 : 1) * KEY_STEP;
        setSidebarWidth(side, width + (e.key === 'ArrowRight' ? 1 : -1) * grow * step);
      }}
      onDoubleClick={() => resetSidebarWidth(side)}
      className={cn(
        'absolute top-12 bottom-0 z-20 w-1.5 cursor-col-resize touch-none outline-none max-[900px]:hidden',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors',
        'hover:after:bg-brand/60 focus-visible:after:bg-brand/60 active:after:bg-brand',
        side === 'left' ? 'left-[calc(var(--sb-left)-3px)]' : 'right-[calc(var(--sb-right)-3px)]',
      )}
    />
  );
}

/** Top bar, settings on the left, the workspace in the middle and tabs on the right. The sidebars can be resized. Stacks on narrow screens. */
export function AppLayout({ modeSwitch, actions, left, main, right }: { modeSwitch: ReactNode; actions?: ReactNode; left: ReactNode; main: ReactNode; right: ReactNode }) {
  const widths = useSidebarWidths();
  // The share cap is applied in CSS too, so a window that shrinks after the drag still leaves the middle its room.
  const cap = `${SIDEBAR_MAX_SHARE * 100}vw`;
  const style = { '--sb-left': `min(${widths.left}px, ${cap})`, '--sb-right': `min(${widths.right}px, ${cap})` } as CSSProperties;
  return (
    <div
      style={style}
      className="relative grid h-dvh grid-cols-[var(--sb-left)_minmax(0,1fr)_var(--sb-right)] grid-rows-[48px_minmax(0,1fr)] max-[900px]:flex max-[900px]:h-auto max-[900px]:min-h-dvh max-[900px]:flex-col"
    >
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
      <SidebarHandle side="left" />
      <SidebarHandle side="right" />
    </div>
  );
}

export type SideTab = 'blocks' | 'materials' | 'build' | 'history';

interface SideTabsProps {
  tab: SideTab;
  setTab: (t: SideTab) => void;
  blocks: ReactNode;
  materials: ReactNode;
  /** The plan for building by hand; leave out where there is none. */
  build?: ReactNode;
  history: ReactNode | null;
}

/** The right sidebar: which blocks to use, what the build needs, how to build it, and saved builds. */
export function SideTabs({ tab, setTab, blocks, materials, build, history }: SideTabsProps) {
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
        {build && (
          <TabsTrigger value="build" className="flex-none px-0">
            Build
          </TabsTrigger>
        )}
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
      {build && (
        <TabsContent value="build" className={content}>
          {build}
        </TabsContent>
      )}
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
