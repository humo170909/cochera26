import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const Icons = {
  dashboard: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  parking: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 17V7h3.2a3 3 0 0 1 0 6H9" />
    </svg>
  ),
  entry: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  ),
  exit: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M19 12H6M11 6l-6 6 6 6" />
    </svg>
  ),
  cash: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 6v0M17.5 18v0" />
    </svg>
  ),
  restroom: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="8" cy="5" r="2" />
      <circle cx="16" cy="5" r="2" />
      <path d="M5 22v-7H3l2.5-6h5L13 15h-2v7M14 22v-6h-1l2-6.5c.3-1 1-1.5 2-1.5s1.7.5 2 1.5L21 16h-1v6" />
    </svg>
  ),
  history: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5M12 7v5l4 2" />
    </svg>
  ),
  report: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
    </svg>
  ),
  workers: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.5" cy="8.5" r="2.4" />
      <path d="M16 14.3c2.6.4 4.5 2.3 4.5 5.2" />
    </svg>
  ),
  user: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </svg>
  ),
  subscription: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16c0-1.7 1.3-2.7 3-2.7s3 1 3 2.7M14 10h4M14 13.5h4" />
    </svg>
  ),
  key: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 20 3M16.5 7.5 19 5M20 3l1.5 1.5" />
    </svg>
  ),
  tariff: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 3v18M8 6.5h5a2.7 2.7 0 0 1 0 5.3H9.8a2.7 2.7 0 0 0 0 5.4H16" />
    </svg>
  ),
  audit: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M9 3h6l2 2v16H7V5z" />
      <path d="M10 10h4M10 14h4" />
      <circle cx="8" cy="17.5" r="3.2" />
      <path d="m10.3 19.8 2.4 2.4" />
    </svg>
  ),
  settings: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  menu: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  close: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  sun: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  ),
  moon: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  logout: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  chevronDown: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};
