import * as React from "react";

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const variantStyles = {
      default: "bg-green-100 text-green-800 border-green-200",
      secondary: "bg-yellow-100 text-yellow-800 border-yellow-200",
      outline: "bg-transparent border-gray-300 text-gray-700",
      destructive: "bg-red-100 text-red-800 border-red-200",
    };

    return (
      <span
        ref={ref}
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${variantStyles[variant]} ${className}`}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };

