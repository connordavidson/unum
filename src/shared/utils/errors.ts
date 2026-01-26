/**
 * Error Handling Utilities
 *
 * Standardized error types and handling for the application.
 */

export type ErrorCode =
  | 'NETWORK_ERROR'
  | 'STORAGE_ERROR'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'SYNC_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
  originalError?: unknown;
}

/**
 * Create a standardized AppError from an unknown error
 */
export function createAppError(
  error: unknown,
  context: string,
  defaultCode: ErrorCode = 'UNKNOWN_ERROR'
): AppError {
  const message = error instanceof Error ? error.message : String(error);

  // Detect error type from message patterns
  let code: ErrorCode = defaultCode;
  let recoverable = true;

  if (message.includes('network') || message.includes('Network') || message.includes('fetch')) {
    code = 'NETWORK_ERROR';
    recoverable = true;
  } else if (message.includes('permission') || message.includes('Permission')) {
    code = 'PERMISSION_DENIED';
    recoverable = false;
  } else if (message.includes('not found') || message.includes('Not found')) {
    code = 'NOT_FOUND';
    recoverable = false;
  } else if (message.includes('storage') || message.includes('AsyncStorage')) {
    code = 'STORAGE_ERROR';
    recoverable = true;
  }

  return {
    code,
    message: `[${context}] ${message}`,
    recoverable,
    originalError: error,
  };
}

/**
 * Handle a service error with consistent logging
 * Returns the error for further handling
 */
export function handleServiceError(
  error: unknown,
  context: string,
  silent: boolean = false
): AppError {
  const appError = createAppError(error, context);

  if (!silent) {
    console.error(appError.message, appError.originalError);
  }

  return appError;
}

/**
 * Wrap an async operation with error handling
 * Returns [result, null] on success, [null, error] on failure
 */
export async function tryCatch<T>(
  operation: () => Promise<T>,
  context: string
): Promise<[T, null] | [null, AppError]> {
  try {
    const result = await operation();
    return [result, null];
  } catch (error) {
    return [null, handleServiceError(error, context, true)];
  }
}

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(error: AppError): string {
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Unable to connect. Please check your internet connection.';
    case 'STORAGE_ERROR':
      return 'Failed to save data. Please try again.';
    case 'PERMISSION_DENIED':
      return 'Permission denied. Please grant the required permissions.';
    case 'NOT_FOUND':
      return 'The requested item was not found.';
    case 'VALIDATION_ERROR':
      return 'Invalid data provided.';
    case 'SYNC_ERROR':
      return 'Failed to sync. Changes will be saved locally.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
