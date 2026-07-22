"use client";

import { useCallback, type ReactNode } from "react";

/**
 * Scroll-reveal wrapper. Fades/rises content in when it enters the viewport.
 *
 * Uses a ref callback that toggles the `in` class directly on the node, so
 * there is no React state to keep in sync. Under reduced motion (or without
 * IntersectionObserver) the content is shown immediately and fully — the CSS
 * also forces `.rise` visible under reduced motion, so functionality never
 * depends on the reveal.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const attach = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce || typeof IntersectionObserver === "undefined") {
        node.classList.add("in");
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              window.setTimeout(() => node.classList.add("in"), delay);
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -50px 0px" },
      );
      io.observe(node);
      return () => io.disconnect();
    },
    [delay],
  );

  return (
    <Tag ref={attach as never} className={`rise${className ? ` ${className}` : ""}`}>
      {children}
    </Tag>
  );
}
