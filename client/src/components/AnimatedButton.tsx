import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { VariantProps } from "class-variance-authority";

interface RippleEffect {
  x: number;
  y: number;
  id: number;
}

/**
 * AnimatedButton - Button with ripple effect, scale animation, and haptic feedback
 * 
 * Features:
 * - Ripple effect on click (expanding circle with fade out)
 * - Scale down animation on press (0.95)
 * - Haptic feedback (10ms vibration)
 * - Supports all Button variants from shadcn/ui
 * 
 * Usage:
 * <AnimatedButton variant="default" onClick={handleClick}>
 *   Save
 * </AnimatedButton>
 */
type AnimatedButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  ({ children, onClick, className, ...props }, ref) => {
    const [ripples, setRipples] = useState<RippleEffect[]>([]);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const rippleIdRef = useRef(0);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Trigger haptic feedback (10ms vibration)
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }

      // Create ripple effect
      const button = buttonRef.current;
      if (button) {
        const rect = button.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newRipple: RippleEffect = {
          x,
          y,
          id: rippleIdRef.current++,
        };

        setRipples((prev) => [...prev, newRipple]);

        // Remove ripple after animation completes
        setTimeout(() => {
          setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
        }, 600);
      }

      // Call original onClick handler
      if (onClick) {
        onClick(e);
      }
    };

    return (
      <motion.div
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="relative inline-block"
      >
        <Button
          ref={(node) => {
            // Handle both refs
            if (buttonRef) {
              (buttonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
            }
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
            }
          }}
          onClick={handleClick}
          className={`relative overflow-hidden ${className || ''}`}
          {...props}
        >
          {children}

          {/* Ripple effects */}
          {ripples.map((ripple) => (
            <span
              key={ripple.id}
              className="absolute rounded-full bg-white/30 pointer-events-none"
              style={{
                left: ripple.x,
                top: ripple.y,
                width: 0,
                height: 0,
                transform: 'translate(-50%, -50%)',
                animation: 'ripple 600ms ease-out',
              }}
            />
          ))}
        </Button>

        <style>{`
          @keyframes ripple {
            to {
              width: 200px;
              height: 200px;
              opacity: 0;
            }
          }
        `}</style>
      </motion.div>
    );
  }
);

AnimatedButton.displayName = "AnimatedButton";
