import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "sm" | "md" | "lg" | "xl";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover active:scale-[0.99]",
  secondary:
    "bg-surface-2 text-foreground border border-border hover:bg-border/60",
  danger: "bg-danger text-white hover:opacity-90 active:scale-[0.99]",
  success: "bg-success text-white hover:opacity-90 active:scale-[0.99]",
  ghost: "bg-transparent text-foreground hover:bg-surface-2",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-11 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-base rounded-xl gap-2",
  lg: "h-14 px-6 text-lg font-semibold rounded-xl gap-2",
  xl: "h-16 px-8 text-xl font-bold rounded-2xl gap-3",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", fullWidth, className = "", disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`inline-flex items-center justify-center font-medium transition-all cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
