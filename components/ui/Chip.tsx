"use client";

import * as React from "react";

type ChipVariant = "neutral" | "primary" | "success" | "warning" | "danger" | "outline";
type ChipSize = "sm" | "md";

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  variant?: ChipVariant;
  size?: ChipSize;
  selected?: boolean;
}

const base =
  "inline-flex items-center gap-2 rounded-xl transition-all duration-200 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 " +
  "active:scale-[.98] select-none";

const sizes: Record<ChipSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

const variants: Record<ChipVariant, string> = {
  neutral:
    "border border-gray-200 bg-white/80 text-gray-700 hover:border-purple-300 hover:bg-white hover:shadow",
  outline:
    "border border-purple-200 bg-white/80 text-purple-700 hover:bg-white hover:shadow",
  primary:
    "border border-transparent bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-sm hover:from-purple-700 hover:to-blue-700",
  success:
    "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  warning:
    "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  danger:
    "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
};

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { leading, trailing, variant = "neutral", size = "md", selected = false, className = "", ...props },
  ref
) {
  const selectedCls = selected ? "ring-2 ring-purple-300 ring-offset-1" : "";
  return (
    <button
      ref={ref}
      className={`${base} ${sizes[size]} ${variants[variant]} ${selectedCls} ${className}`}
      {...props}
    >
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="whitespace-nowrap">{props.children}</span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </button>
  );
});

export function ChipRow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mt-2 flex flex-wrap gap-2 ${className}`}>{children}</div>;
}

