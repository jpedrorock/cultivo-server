/**
 * useTactileFeedback
 *
 * Provides haptic/tactile feedback via the Vibration API (supported on Android Chrome
 * and some iOS browsers). Falls back silently on unsupported devices.
 *
 * Usage:
 *   const { tap, confirm, warning, destructive } = useTactileFeedback();
 *   <button onClick={() => { tap(); doSomething(); }}>...</button>
 */

type FeedbackType = "tap" | "confirm" | "warning" | "destructive";

const PATTERNS: Record<FeedbackType, number | number[]> = {
  /** Light tap — standard button press */
  tap: 10,
  /** Double tap — positive confirmation (e.g. save, move) */
  confirm: [10, 60, 10],
  /** Medium buzz — attention-needed action */
  warning: 40,
  /** Strong double buzz — irreversible / destructive action */
  destructive: [50, 80, 50],
};

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silently ignore — vibration is a progressive enhancement
  }
}

export function useTactileFeedback() {
  return {
    /** Light tap for any standard button press */
    tap: () => vibrate(PATTERNS.tap),
    /** Double tap for positive confirmations */
    confirm: () => vibrate(PATTERNS.confirm),
    /** Medium buzz for attention-needed actions */
    warning: () => vibrate(PATTERNS.warning),
    /** Strong double buzz for destructive / irreversible actions */
    destructive: () => vibrate(PATTERNS.destructive),
  };
}
