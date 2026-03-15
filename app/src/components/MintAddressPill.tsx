"use client";
import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

const FPT_MINT = "3YTnzmFTECtyKDxaghWPQcjzX7g1Cj3NxMq41JdWk2rj";

function truncate(addr: string, start = 6, end = 4) {
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

export default function MintAddressPill({ isDarkMode }: { isDarkMode: boolean }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(FPT_MINT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <div className="flex justify-center mt-10">
      <button
        onClick={handleCopy}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex items-center gap-3 px-5 py-3 rounded-full transition-all duration-300"
        style={{
          background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
          border: hovered
            ? "1px solid rgba(99,102,241,0.6)"
            : isDarkMode
            ? "1px solid rgba(255,255,255,0.12)"
            : "1px solid rgba(0,0,0,0.12)",
          backdropFilter: "blur(10px)",
          boxShadow: hovered ? "0 0 18px rgba(99,102,241,0.25)" : "none",
        }}
        aria-label="Copy FPT mint address"
      >
        <span
          className="text-sm font-bold whitespace-nowrap"
          style={{ color: isDarkMode ? "#818cf8" : "#4f46e5" }}
        >
          Fortress Protocol (FPT):
        </span>
        <span
          className="font-mono text-sm"
          style={{
            color: isDarkMode ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.65)",
          }}
        >
          <span className="hidden sm:inline">{FPT_MINT}</span>
          <span className="inline sm:hidden">{truncate(FPT_MINT)}</span>
        </span>
        <span className="flex-shrink-0 w-5 h-5">
          {copied ? (
            <Check className="w-5 h-5 text-green-500" />
          ) : (
            <Copy
              className="w-5 h-5"
              style={{
                color: isDarkMode ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
              }}
            />
          )}
        </span>
        {copied && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap bg-green-500 text-white shadow-lg">
            Address Copied!
          </span>
        )}
      </button>
    </div>
  );
}
