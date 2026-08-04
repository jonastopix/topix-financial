import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const hbButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-hb-evergreen text-white hover:bg-hb-evergreen/90 px-6 h-11",
        secondary: "border border-hb-ink/25 text-hb-ink hover:bg-hb-sage/50 px-6 h-11",
        link: "text-hb-rust underline-offset-4 hover:underline px-0 h-auto",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export interface HbButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof hbButtonVariants> {}

const HbButton = React.forwardRef<HTMLButtonElement, HbButtonProps>(({ className, variant, ...props }, ref) => (
  <button ref={ref} className={cn(hbButtonVariants({ variant, className }))} {...props} />
));
HbButton.displayName = "HbButton";

export { HbButton, hbButtonVariants };
