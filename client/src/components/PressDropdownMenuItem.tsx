import { forwardRef, useState, useCallback } from "react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { ComponentPropsWithoutRef } from "react";

type MenuItemProps = ComponentPropsWithoutRef<typeof DropdownMenuItem>;

interface PressDropdownMenuItemProps extends MenuItemProps {
  pressIntensity?: "light" | "medium" | "strong";
}

/**
 * PressDropdownMenuItem
 *
 * A drop-in replacement for <DropdownMenuItem> that adds a tactile press
 * animation (scale + background flash) on touch/click.
 */
export const PressDropdownMenuItem = forwardRef<
  HTMLDivElement,
  PressDropdownMenuItemProps
>(({ pressIntensity = "light", onClick, style, children, ...props }, ref) => {
  const [pressed, setPressed] = useState(false);

  const scaleMap = { light: 0.97, medium: 0.94, strong: 0.91 };
  const scale = scaleMap[pressIntensity];

  const pressStyle: React.CSSProperties = {
    transform: pressed ? `scale(${scale})` : "scale(1)",
    opacity: pressed ? 0.75 : 1,
    transition: pressed
      ? "transform 0.07s ease-out, opacity 0.07s ease-out"
      : "transform 0.15s ease-out, opacity 0.15s ease-out",
    borderRadius: "4px",
    ...style,
  };

  const handlePointerDown = useCallback(() => setPressed(true), []);
  const handlePointerUp = useCallback(() => setPressed(false), []);
  const handlePointerLeave = useCallback(() => setPressed(false), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setPressed(false);
      onClick?.(e);
    },
    [onClick]
  );

  return (
    <DropdownMenuItem
      ref={ref}
      style={pressStyle}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      {...props}
    >
      {children}
    </DropdownMenuItem>
  );
});

PressDropdownMenuItem.displayName = "PressDropdownMenuItem";
