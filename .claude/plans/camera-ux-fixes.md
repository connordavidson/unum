# Camera UX Fixes (Completed)

## Changes Made

### 1. Recording Lock Feature
- Hold to record → slide right (>80px) to lock → lift finger → recording continues → tap capture button to stop
- Lock state managed via `isRecordingLocked` state + `isRecordingLockedRef` ref in `useCamera`
- `lockRecording()` and `stopLockedRecording()` functions added
- `onHoldEnd` guarded with `!isRecordingLockedRef.current` so release doesn't stop locked recording
- Pan gesture in CameraScreen detects horizontal slide (`translationX > LOCK_SLIDE_THRESHOLD_PX`)
- Tap-to-stop intercepted in `onTouchesDown` before `onGestureStart` (avoids triggering photo)

### 2. Locked Zoom (Full-Screen Overlay)
- Transparent overlay View rendered ON TOP of CameraView when locked (avoids native camera consuming touches)
- Separate `lockedZoomGesture` Pan with `minDistance(5)` so taps pass through to capture button
- `zoomBase` shared value persists zoom level across multiple touch gestures
- Zoom level captured into `zoomBase` at moment of locking; updated in `onEnd` of each gesture
- Controls rendered above overlay in z-order so capture button still handles stop-tap

### 3. Video Preview Playback
- `useVideoPlayer(null, ...)` — constant null source prevents race with hook internals
- `replaceAsync(recordedVideo).then(() => player.play())` — async load, play only after ready
- Avoids deprecated synchronous `replace()` method

### 4. Lock Icon Indicator
- Lock icon (`Ionicons "lock-closed"`) shown to the right of capture button during recording
- Visible when `isRecording && !isRecordingLocked`
- Semi-transparent circular background (`lockIndicator` style)

## Files Modified

| File | Changes |
|------|---------|
| `src/shared/constants/index.ts` | Added `LOCK_SLIDE_THRESHOLD_PX: 80` |
| `src/hooks/useCamera.ts` | Lock state, `lockRecording()`, `stopLockedRecording()`, guards |
| `src/screens/CameraScreen.tsx` | Gesture handlers, overlay, lock icon, video preview, hint text |
| `documentation.md` | Documented all features |
