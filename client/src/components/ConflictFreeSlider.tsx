import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ConflictFreeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  unit?: string;
  className?: string;
  showValue?: boolean;
  customGradient?: string;
  customLabels?: React.ReactNode;
  trackHeight?: string;
  thumbSize?: string;
}

/**
 * ConflictFreeSlider - A slider component that prevents conflicts with swipe gestures
 * 
 * Features:
 * - Stops touch event propagation to prevent swipe navigation
 * - 44x44px touch targets (iOS guideline)
 * - 48px track height for easy interaction
 * - 32px horizontal padding to keep away from edges
 * - Visual feedback (highlight) when active
 * - Haptic feedback on touch
 * - Centered positioning
 */
export const ConflictFreeSlider = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  unit,
  className,
  showValue = true,
  customGradient,
  customLabels,
  trackHeight = "h-12",
  thumbSize = "w-11 h-11",
}: ConflictFreeSliderProps) => {
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Stop propagation to prevent swipe navigation
    e.stopPropagation();
    setIsActive(true);

    // Haptic feedback (10ms vibration)
    if ("vibrate" in navigator) {
      navigator.vibrate(10);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Stop propagation to prevent swipe navigation
    e.stopPropagation();
  };

  const handleTouchEnd = () => {
    setIsActive(false);
  };

  const handleMouseDown = () => {
    setIsActive(true);
  };

  const handleMouseUp = () => {
    setIsActive(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "px-8 py-6 transition-all duration-200", // 32px horizontal padding
        isActive && "ring-2 ring-green-500 rounded-lg bg-green-50/50",
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={cn(
          "w-full appearance-none bg-gray-200 rounded-full cursor-pointer",
          trackHeight,
          "focus:outline-none focus:ring-2 focus:ring-green-500",
          // Webkit (Safari, Chrome)
          "[&::-webkit-slider-thumb]:appearance-none",
          `[&::-webkit-slider-thumb]:${thumbSize.replace(' ', ' [&::-webkit-slider-thumb]:')}`,
          "[&::-webkit-slider-thumb]:rounded-full",
          "[&::-webkit-slider-thumb]:bg-white",
          "[&::-webkit-slider-thumb]:cursor-pointer",
          "[&::-webkit-slider-thumb]:shadow-lg",
          "[&::-webkit-slider-thumb]:border-4",
          "[&::-webkit-slider-thumb]:border-gray-300",
          "[&::-webkit-slider-thumb]:transition-transform",
          "[&::-webkit-slider-thumb]:hover:scale-110",
          "[&::-webkit-slider-thumb]:active:scale-105",
          // Firefox
          "[&::-moz-range-thumb]:appearance-none",
          `[&::-moz-range-thumb]:${thumbSize.replace(' ', ' [&::-moz-range-thumb]:')}`,
          "[&::-moz-range-thumb]:rounded-full",
          "[&::-moz-range-thumb]:bg-white",
          "[&::-moz-range-thumb]:cursor-pointer",
          "[&::-moz-range-thumb]:shadow-lg",
          "[&::-moz-range-thumb]:border-4",
          "[&::-moz-range-thumb]:border-gray-300",
          "[&::-moz-range-thumb]:transition-transform",
          "[&::-moz-range-thumb]:hover:scale-110",
          "[&::-moz-range-thumb]:active:scale-105",
          // Track
          "[&::-webkit-slider-runnable-track]:rounded-full",
          "[&::-moz-range-track]:rounded-full"
        )}
        style={customGradient ? { background: customGradient } : undefined}
      />

      {customLabels && customLabels}

      {showValue && (
        <div className="text-center mt-3 text-lg font-semibold text-gray-900">
          {value}
          {unit && <span className="text-gray-600 ml-1">{unit}</span>}
        </div>
      )}
    </div>
  );
};
