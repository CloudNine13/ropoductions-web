"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { pickNextErrorReaction, type ErrorReactionAsset } from "@/lib/error-reactions";

interface ErrorReactionIconProps {
  className?: string;
}

export function ErrorReactionIcon({ className = "h-16 w-16" }: ErrorReactionIconProps) {
  const [asset, setAsset] = useState<ErrorReactionAsset | null>(null);
  const drawn = useRef(false);

  useEffect(() => {
    // Drawn on the client so each error appearance gets its own reaction and the
    // server-rendered markup never commits to one. The guard keeps the strict-mode
    // double invocation to a single draw, so the stored reaction is the one shown.
    if (drawn.current) {
      return;
    }
    drawn.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAsset(pickNextErrorReaction());
  }, []);

  if (asset === null) {
    return <div className={className} aria-hidden="true" />;
  }

  return (
    <Image
      src={asset}
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      unoptimized
      className={`shrink-0 ${className}`}
    />
  );
}
