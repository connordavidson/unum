/**
 * Retry Utility
 *
 * Provides exponential backoff retry logic for AWS operations.
 */

import { retryConfig } from '../config';
import { getLoggingService } from '../../services/logging.service';

const log = getLoggingService().createLogger('API');

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export class RetryError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Default retry condition - retries on transient/throttling errors
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name;

    // AWS SDK error codes that are retryable
    const retryableNames = [
      'ProvisionedThroughputExceededException',
      'ThrottlingException',
      'RequestLimitExceeded',
      'InternalServerError',
      'ServiceUnavailable',
      'TransactionConflictException',
    ];

    if (retryableNames.includes(name)) {
      return true;
    }

    // Network errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (0-25% of delay)
  const jitter = cappedDelay * 0.25 * Math.random();

  return cappedDelay + jitter;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = retryConfig.maxRetries,
    baseDelayMs = retryConfig.baseDelayMs,
    maxDelayMs = retryConfig.maxDelayMs,
    shouldRetry = isRetryableError,
  } = options;

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt or non-retryable errors
      if (attempt === maxRetries || !shouldRetry(error)) {
        // Log final failure to Crashlytics
        log.error(`AWS operation failed after ${attempt + 1} attempt(s)`, lastError);
        throw lastError;
      }

      // Calculate and wait for retry delay
      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      log.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`, {
        error: lastError.message,
        errorName: lastError.name,
      });
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  const retryError = new RetryError(
    `Operation failed after ${maxRetries + 1} attempts`,
    maxRetries + 1,
    lastError
  );
  log.error('AWS operation exhausted all retries', retryError);
  throw retryError;
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) => withRetry(() => fn(...args), options)) as T;
}
