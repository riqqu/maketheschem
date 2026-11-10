const PATHS: Record<string, string> = {
  brush: 'M4 20c2.5 0 4.5-1.2 4.5-3.5a2.2 2.2 0 0 0-4.4 0c0 1.6-.5 2.6-.1 3.5Z M8 14.5 18.5 4 20 5.5 9.5 16',
  eraser: 'M14 3.5 20.5 10 11 19.5H6.5L3.5 16.5Z M8 9.5l6.5 6.5 M11 19.5h9',
  picker: 'M18.5 3.8a2 2 0 0 1 2.8 2.8L18.8 9l1 1-1.5 1.5-5.8-5.8L14 4.2l1 1Z M12.5 7.5 5 15v4h4l7.5-7.5',
  fill: 'M5.2 11.2 11 5.4l7 7-5.8 5.8a2 2 0 0 1-2.8 0l-4.2-4.2a2 2 0 0 1 0-2.8Z M5 12.4h13 M20 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3Z M8 2.5l3 3',
  replace: 'M4 8h13l-3.5-3.5 M20 16H7l3.5 3.5',
  undo: 'M9 13.5 4.5 9 9 4.5 M4.5 9h10a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 13.5 19.5 9 15 4.5 M19.5 9h-10a5.5 5.5 0 0 0 0 11H13',
  grid: 'M3.5 3.5h17v17h-17Z M3.5 9.2h17 M3.5 14.8h17 M9.2 3.5v17 M14.8 3.5v17',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  lock: 'M6 11h12v9H6Z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6Z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  upload: 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M4 15v5h16v-5',
  download: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M4 20h16',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z M15.5 15.5 20 20',
  close: 'M6 6l12 12 M18 6 6 18',
  chevron: 'M9 6l6 6-6 6',
  texture: 'M3.5 4.5h17v15h-17Z M3.5 9.5h17 M3.5 14.5h17 M9 4.5v5 M15 9.5v5 M9 14.5v5',
  image: 'M3.5 4.5h17v15h-17Z M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5 M15.5 9.5a1.5 1.5 0 1 0 0-.01',
  warn: 'M12 4 21 20H3Z M12 10v4.5 M12 17.2v.3',
  copy: 'M8.5 8.5h11v11h-11Z M15.5 8.5v-4h-11v11h4',
  blank: 'M4 4h16v16H4Z M4 12h16 M12 4v16',
  measure: 'M5 19 19 5 M3.5 15.5l5 5 M15.5 3.5l5 5',
  ruler: 'M3.5 15.5 15.5 3.5l5 5-12 12Z M7.5 11.5l2 2 M10.5 8.5l2 2 M13.5 5.5l2 2',
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
