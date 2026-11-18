/* Minimal stroke icon set, drawn on a 24px grid, currentColor. */
const P = {
  habits: "M4 5h4v4H4zM10 7h10M4 15h4v4H4zM10 17h10M5.5 7l1 1 2-2",
  dayring: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 3v4M21 12h-4M12 12l3-2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 14h2M13 14h2M9 17h2",
  journal: "M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2zM6 17a2 2 0 0 1 2-2h11M10 7h6M10 10h4",
  trackers: "M3 17l5-6 4 3 5-7 4 4M3 21h18",
  board: "M4 4h16v16H4zM4 15l5-5 4 4 3-3 4 4M15 8.5a1.5 1.5 0 1 0 0 .01",
  identity: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  contact: "M4 6h16v12H4zM4 7l8 6 8-6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 7h16M4 12h16M4 17h16",
  plus: "M12 5v14M5 12h14",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
} as const;

export type IconName = keyof typeof P;

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
