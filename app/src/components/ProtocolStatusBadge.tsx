"use client";

interface Props {
  label: string;
}

/**
 * Shared badge component displayed on every tier card.
 * Shows protocol status label.
 */
export default function ProtocolStatusBadge({ label }: Props) {
  const isAwaiting = label.includes("Awaiting");

  return (
    <div className="flex flex-col items-center gap-1 my-2">
      <div
        className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${
          isAwaiting
            ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
            : "border-green-500/30 bg-green-500/10 text-green-400"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full animate-pulse ${
            isAwaiting ? "bg-amber-400" : "bg-green-400"
          }`}
        />
        {label}
      </div>
    </div>
  );
}
