/**
 * Style Utilities
 *
 * Helper functions for creating common style patterns.
 */

import type { ViewStyle } from 'react-native';

/**
 * Create circular button styles with given size and background color
 */
export function circularButtonStyle(
  size: number,
  backgroundColor: string
): ViewStyle {
  return {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor,
    justifyContent: 'center',
    alignItems: 'center',
  };
}
