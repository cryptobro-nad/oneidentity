import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether a scroll container overflows horizontally, so a table can show
 * a "scroll to see more" affordance only when there is actually more to reach.
 */
export function useHorizontalOverflow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    window.addEventListener("resize", check);
    // ResizeObserver is absent in some test environments (jsdom); the resize
    // listener still keeps the hint correct there.
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(check);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  return { ref, overflows };
}
