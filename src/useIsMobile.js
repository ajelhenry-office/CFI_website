import { useEffect, useState } from "react";

// Single shared breakpoint for the whole app. 820px catches phones and small
// tablets in portrait — the point where the fixed sidebar + desktop padding stop
// fitting.
export const MOBILE_BREAKPOINT = 820;

export default function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}
