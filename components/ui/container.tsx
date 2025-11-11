import React from "react";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Container({ className = "", ...props }: ContainerProps) {
  return (
    <div
      {...props}
      className={["mx-auto max-w-6xl px-6 sm:px-8", className].filter(Boolean).join(" ")}
    />
  );
}

