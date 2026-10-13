import { useState } from "react";

type Props = {
  text: string | null | undefined;
  maxChars?: number;
  empty?: string;
  className?: string;
};

/** Truncate long table text; click to expand it downward (wrapped) and back. */
export function ExpandableText({
  text,
  maxChars = 48,
  empty = "—",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const value = (text ?? "").trim();
  if (!value) return <span className={className}>{empty}</span>;
  if (value.length <= maxChars) {
    return (
      <span className={`expandable-text-static ${className ?? ""}`} title={value}>
        {value}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`expandable-text${open ? " is-open" : ""} ${className ?? ""}`}
      aria-expanded={open}
      title={open ? "Show less" : "Show full description"}
      onClick={() => setOpen((prev) => !prev)}
    >
      {open ? value : `${value.slice(0, maxChars).trimEnd()}…`}
      <span className="expandable-text-toggle">{open ? "Show less" : "More"}</span>
    </button>
  );
}
