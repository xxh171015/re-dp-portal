export function ThinkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M2.5 8c0-1.6 1.3-2.9 2.9-2.9 2.1 0 3.1 2.9 4.6 2.9s2.5-2.9 4.6-2.9c1.6 0 2.9 1.3 2.9 2.9s-1.3 2.9-2.9 2.9c-2.1 0-3.1-2.9-4.6-2.9S7.5 10.9 5.4 10.9C3.8 10.9 2.5 9.6 2.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="8" r="5.15" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <ellipse cx="8" cy="8" rx="2.15" ry="5.15" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.85 8h10.3M4.05 5.15h7.9M4.05 10.85h7.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M8.31 0.98c.36.07.67.22.95.45.23.18.47.43.72.68L14.71 6.83 13.29 8.25 9 3.96V15.04H7V3.96L2.71 8.25 1.29 6.83 6.02 2.11c.25-.25.49-.5.72-.68.24-.19.55-.39.95-.45.21-.03.41-.03.62 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 2v12M2 8h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PanelSearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SparkleIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 1.6 9.1 6 13.6 7.2 9.1 8.4 8 12.8 6.9 8.4 2.4 7.2 6.9 6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <svg className="wordmark-mark" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <circle cx="14" cy="14" r="13" fill="#4d6bfe" />
        <path
          d="M8.2 16.4c.4-3.2 2.3-6.4 5.8-7.2 2.6-.6 4.8.6 5.4 2.6.5 1.8-.4 3.4-2.4 4.2-1.4.6-2.2 1.6-2.1 2.8"
          fill="none"
          stroke="#fff"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <circle cx="11.2" cy="12.4" r="1.15" fill="#fff" />
      </svg>
      <span className="wordmark-text">deepseek</span>
    </span>
  );
}
