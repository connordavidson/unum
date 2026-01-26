/**
 * useGestureCapture Hook
 *
 * Handles tap/hold gesture discrimination for capture actions.
 * Tap triggers one action (photo), hold triggers another (video recording).
 */

import { useRef, useCallback } from 'react';
import { CAMERA_CONFIG } from '../shared/constants';

interface UseGestureCaptureConfig {
  /** Callback when tap is detected (quick press and release) */
  onTap: () => void;
  /** Callback when hold starts (press held longer than delay) */
  onHoldStart: () => void;
  /** Callback when hold ends (release after hold started) */
  onHoldEnd: () => void;
  /** Delay in ms before press becomes a hold (default: CAMERA_CONFIG.HOLD_DELAY_MS) */
  holdDelayMs?: number;
  /** Whether gesture is enabled */
  enabled?: boolean;
}

interface UseGestureCaptureResult {
  /** Call when press begins */
  handlePressIn: () => void;
  /** Call when press ends */
  handlePressOut: () => void;
  /** Whether currently in hold state */
  isHolding: boolean;
}

export function useGestureCapture({
  onTap,
  onHoldStart,
  onHoldEnd,
  holdDelayMs = CAMERA_CONFIG.HOLD_DELAY_MS,
  enabled = true,
}: UseGestureCaptureConfig): UseGestureCaptureResult {
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const holdStartedRef = useRef(false);

  const handlePressIn = useCallback(() => {
    if (!enabled) return;

    isHoldingRef.current = true;
    holdStartedRef.current = false;

    holdTimerRef.current = setTimeout(() => {
      if (isHoldingRef.current) {
        holdStartedRef.current = true;
        onHoldStart();
      }
    }, holdDelayMs);
  }, [enabled, holdDelayMs, onHoldStart]);

  const handlePressOut = useCallback(() => {
    if (!enabled) return;

    const wasHolding = isHoldingRef.current;
    const holdDidStart = holdStartedRef.current;

    isHoldingRef.current = false;
    holdStartedRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (holdDidStart) {
      // Hold was active, end it
      onHoldEnd();
    } else if (wasHolding) {
      // Was pressed but hold didn't start = tap
      onTap();
    }
  }, [enabled, onTap, onHoldEnd]);

  return {
    handlePressIn,
    handlePressOut,
    isHolding: isHoldingRef.current,
  };
}
