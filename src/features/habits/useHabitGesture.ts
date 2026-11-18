import { useCallback, useEffect, useRef } from "react";

export const HOLD_MS = 500;
export const DOUBLE_MS = 250;

export interface GestureHandlers {
  onSingle: () => void; // click/tap → partial
  onDouble: () => void; // double → done
  onHold: () => void; // hold → details
  onSkip?: () => void; // right-click / Alt+Enter → skipped
  disabled?: boolean;
}

/**
 * Every habit-cell gesture lives here (pointer events only, never mouse
 * events) so the phone mapping is one file. On touch, a long press would
 * also fire `contextmenu`; that is swallowed so a hold opens details
 * instead of silently marking the day skipped (skip is in the detail sheet).
 *
 * Keyboard: Enter = single, Ctrl/⌘+Enter = double, Shift+Enter = hold, Alt+Enter = skip.
 */
export function useHabitGesture({ onSingle, onDouble, onHold, onSkip, disabled }: GestureHandlers) {
  const holdTimer = useRef<number>();
  const clickTimer = useRef<number>();
  const held = useRef(false);
  const clicks = useRef(0);
  const lastType = useRef<string>("mouse");

  useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(clickTimer.current);
    },
    []
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button > 0) return;
      lastType.current = e.pointerType || "mouse";
      if (e.pointerType !== "touch") e.preventDefault(); // no text selection while holding
      held.current = false;
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        held.current = true;
        clicks.current = 0;
        window.clearTimeout(clickTimer.current);
        onHold();
      }, HOLD_MS);
    },
    [onHold, disabled]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button > 0) return;
      window.clearTimeout(holdTimer.current);
      if (held.current) {
        held.current = false;
        return;
      }
      clicks.current += 1;
      if (clicks.current === 1) {
        clickTimer.current = window.setTimeout(() => {
          clicks.current = 0;
          onSingle();
        }, DOUBLE_MS);
      } else {
        window.clearTimeout(clickTimer.current);
        clicks.current = 0;
        onDouble();
      }
    },
    [onSingle, onDouble, disabled]
  );

  const cancel = useCallback(() => {
    window.clearTimeout(holdTimer.current);
    held.current = false;
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || e.key !== "Enter") return;
      e.preventDefault();
      if (e.altKey) onSkip?.();
      else if (e.shiftKey) onHold();
      else if (e.ctrlKey || e.metaKey) onDouble();
      else onSingle();
    },
    [onSingle, onDouble, onHold, onSkip, disabled]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (disabled || lastType.current === "touch") return;
      window.clearTimeout(holdTimer.current);
      onSkip?.();
    },
    [onSkip, disabled]
  );

  return { onPointerDown, onPointerUp, onPointerLeave: cancel, onPointerCancel: cancel, onKeyDown, onContextMenu };
}
