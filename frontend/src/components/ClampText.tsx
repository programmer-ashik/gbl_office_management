import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  /** Tooltip with the full text while it is cut off. */
  title?: string;
  className?: string;
};

/**
 * One line with "…" when the cell is too narrow. Clicking expands it downward
 * (wrapped lines) instead of widening the column; a link inside only navigates
 * once the full text is showing.
 */
export function ClampText({ children, title, className }: Props) {
  const bodyRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || open) return;
    const measure = () => setTruncated(body.scrollWidth > body.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [open, children]);

  function onClickCapture(event: MouseEvent) {
    if (open || !truncated) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  const classes = [
    "clamp-text",
    open ? "is-open" : "",
    truncated && !open ? "is-truncated" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      title={truncated && !open ? title : undefined}
      onClickCapture={onClickCapture}
    >
      <span ref={bodyRef} className="clamp-text-body">
        {children}
      </span>
      {open ? (
        <button
          type="button"
          className="clamp-text-toggle"
          onClick={() => setOpen(false)}
        >
          Show less
        </button>
      ) : null}
    </span>
  );
}
