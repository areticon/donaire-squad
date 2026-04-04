import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</label>
        )}
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors duration-200 resize-none",
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
Textarea.displayName = "Textarea";

export { Textarea };
