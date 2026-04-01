import { useCallback, useEffect, useRef, useState } from "react";

const ROW_HEIGHT = 49;
const MIN_PAGE_SIZE = 5;
const PAGINATION_FOOTER = 72;
const THEAD_HEIGHT = 41;

/**
 * Computes how many table rows fit in the remaining viewport space below
 * the referenced container element. Recalculates on window resize.
 *
 * Attach `containerRef` to the border div wrapping the table.
 */
export function useDynamicPageSize(
  rowHeight = ROW_HEIGHT,
  minSize = MIN_PAGE_SIZE,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(minSize);

  const calculate = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    // Guard against pre-layout where top is 0
    if (top <= 0) return;
    const available =
      window.innerHeight - top - THEAD_HEIGHT - PAGINATION_FOOTER;
    const size = Math.max(minSize, Math.floor(available / rowHeight));
    setPageSize(size);
  }, [rowHeight, minSize]);

  useEffect(() => {
    // Use ResizeObserver on the element so we catch layout shifts,
    // not just window resize (e.g. sidebar collapse, content above loading in).
    const el = containerRef.current;
    if (!el) return;

    // Run once after paint so getBoundingClientRect is accurate
    const rafId = requestAnimationFrame(calculate);

    const observer = new ResizeObserver(calculate);
    observer.observe(document.documentElement);

    window.addEventListener("resize", calculate);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", calculate);
    };
  }, [calculate]);

  return { containerRef, pageSize };
}
