import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</label>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors duration-200",
            error && "border-red-500 focus:ring-red-500",
            className
          )}
          style={{
            borderColor: error ? undefined : "var(--border)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
            ...style,
          }}
          ref={ref}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
