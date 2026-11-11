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
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6 M3.5 4.5V9H8 M12 7.5V12l3 2',
  trash: 'M4.5 6.5h15 M9.5 6.5V4h5v2.5 M6.5 6.5l1 13h9l1-13 M10 10v6 M14 10v6',
  line: 'M5 19 19 5 M3.5 17.5h3v3h-3Z M17.5 3.5h3v3h-3Z',
  rect: 'M4.5 6.5h15v11h-15Z',
  rectFilled: 'M4.5 6.5h15v11h-15Z M7.5 9.5h9 M7.5 12h9 M7.5 14.5h9',
  select: 'M4 7V4h3 M10 4h4 M17 4h3v3 M20 10v4 M20 17v3h-3 M14 20h-4 M7 20H4v-3 M4 14v-4',
  flipH: 'M12 3.5v17 M9 7 4 17h5Z M15 7l5 10h-5Z',
  flipV: 'M3.5 12h17 M7 9 17 4v5Z M7 15l10 5v-5Z',
  rot180: 'M5 10a7.5 7.5 0 0 1 14 0 M19 14a7.5 7.5 0 0 1-14 0 M16 10h3.2V6.8 M8 14H4.8v3.2',
  rotCW: 'M19 12a7 7 0 1 1-2.05-4.95 M19.5 3.5v4h-4',
  overlay: 'M3.5 8.5h12v12h-12Z M8.5 5.5v-2h12v12h-2',
  paste: 'M8.5 5.5h-3v15h13v-15h-3 M8.5 3.5h7v4h-7Z',
  cut: 'M6.5 20a2.5 2.5 0 1 0 0-.01 M17.5 20a2.5 2.5 0 1 0 0-.01 M8 18 17 4 M16 18 7 4',
  file: 'M6 3.5h8l4 4v13H6Z M14 3.5v4h4',
  folder: 'M3.5 5.5h6l2 2.5h9v11.5h-17Z M3.5 10.5h17',
  cube: 'M12 3 20 7.5v9L12 21l-8-4.5v-9Z M4 7.5 12 12l8-4.5 M12 12v9',
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
