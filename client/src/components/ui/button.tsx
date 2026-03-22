import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-[0_0_10px_rgba(74,222,128,0.2)] hover:from-emerald-500 hover:to-green-700 hover:shadow-[0_0_14px_rgba(74,222,128,0.35)] active:scale-[0.98]",
        destructive:
          "bg-gradient-to-br from-red-400 to-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.2)] hover:from-red-500 hover:to-red-700 hover:shadow-[0_0_12px_rgba(239,68,68,0.35)] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 active:scale-[0.98]",
        outline:
          "border border-border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-muted/20 dark:border-border dark:hover:bg-muted/40 dark:hover:border-border",
        secondary:
          "bg-gradient-to-br from-secondary to-secondary/70 text-secondary-foreground hover:from-secondary/90 hover:to-secondary/60",
        ghost:
          "hover:bg-accent dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
