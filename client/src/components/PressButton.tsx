import { forwardRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<typeof Button>;

interface PressButtonProps extends ButtonProps {
  /** Feedback intensity: "light" (default) | "medium" | "strong" */
  pressIntensity?: "light" | "medium" | "strong";
}

/**
 * PressButton
 *
 * A drop-in replacement for <Button> that adds a tactile press animation
 * (scale + opacity) on touch/click. Works via inline styles for maximum
 * Safari iOS compatibility.
 */
export const PressButton = forwardRef<HTMLButtonElement, PressButtonProps>(
  ({ pressIntensity = "light", onClick, style, children, ...props }, ref) => {
    const [pressed, setPressed] = useState(false);

    const scaleMap = { light: 0.95, medium: 0.92, strong: 0.88 };
    const scale = scaleMap[pressIntensity];

    const pressStyle: React.CSSProperties = {
      transform: pressed ? `scale(${scale})` : "scale(1)",
      opacity: pressed ? 0.8 : 1,
      transition: pressed
        ? "transform 0.08s ease-out, opacity 0.08s ease-out"
        : "transform 0.18s ease-out, opacity 0.18s ease-out",
      WebkitTransform: pressed ? `scale(${scale})` : "scale(1)",
      ...style,
    };

    const handlePointerDown = useCallback(() => setPressed(true), []);
    const handlePointerUp = useCallback(() => setPressed(false), []);
    const handlePointerLeave = useCallback(() => setPressed(false), []);

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        setPressed(false);
        onClick?.(e);
      },
      [onClick]
    );

    return (
      <Button
        ref={ref}
        style={pressStyle}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Button>
    );
  }
);

PressButton.displayName = "PressButton";
