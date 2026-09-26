"use client";

import { useCallback, useState } from "react";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & { src: string; alt: string };

// A plain <img> that fades in once decoded (see .fade-img in globals.css). An image
// can finish loading before React attaches onLoad (cache hits, fast hydration), so the
// ref callback also checks `complete` — otherwise those would stay invisible.
export function FadeImage({ className = "", onLoad, onError, ...props }: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === props.src;

  const checkComplete = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoadedSrc(img.getAttribute("src"));
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={checkComplete}
      loading="lazy"
      decoding="async"
      {...props}
      onLoad={(event) => { setLoadedSrc(props.src); onLoad?.(event); }}
      // A broken image should show the browser's fallback rather than stay transparent.
      onError={(event) => { setLoadedSrc(props.src); onError?.(event); }}
      data-loaded={loaded ? "true" : "false"}
      className={`fade-img ${className}`}
    />
  );
}
