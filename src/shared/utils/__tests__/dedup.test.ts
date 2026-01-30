/**
 * Dedup Utility Tests
 *
 * Tests the promise deduplication utility used by credential services.
 */

import { dedup } from '../dedup';

describe('dedup', () => {
  it('should return the same promise for concurrent calls', async () => {
    let callCount = 0;
    const fn = dedup(async () => {
      callCount++;
      return 'result';
    });

    const p1 = fn();
    const p2 = fn();

    expect(p1).toBe(p2); // Same promise reference
    await Promise.all([p1, p2]);
    expect(callCount).toBe(1);
  });

  it('should allow a new call after previous resolves', async () => {
    let callCount = 0;
    const fn = dedup(async () => {
      callCount++;
      return `result-${callCount}`;
    });

    const r1 = await fn();
    const r2 = await fn();

    expect(callCount).toBe(2);
    expect(r1).toBe('result-1');
    expect(r2).toBe('result-2');
  });

  it('should allow a new call after previous rejects', async () => {
    let callCount = 0;
    const fn = dedup(async () => {
      callCount++;
      if (callCount === 1) throw new Error('fail');
      return 'success';
    });

    await expect(fn()).rejects.toThrow('fail');
    const result = await fn();

    expect(callCount).toBe(2);
    expect(result).toBe('success');
  });

  it('should propagate resolved value to all concurrent callers', async () => {
    const fn = dedup(async () => 'shared-value');

    const [r1, r2, r3] = await Promise.all([fn(), fn(), fn()]);

    expect(r1).toBe('shared-value');
    expect(r2).toBe('shared-value');
    expect(r3).toBe('shared-value');
  });

  it('should propagate rejection to all concurrent callers', async () => {
    const fn = dedup(async () => {
      throw new Error('shared-error');
    });

    const results = await Promise.allSettled([fn(), fn(), fn()]);

    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason.message).toBe('shared-error');
      }
    }
  });

  it('should clear inflight on rejection (not cache errors permanently)', async () => {
    let shouldFail = true;
    const fn = dedup(async () => {
      if (shouldFail) throw new Error('temporary');
      return 'recovered';
    });

    await expect(fn()).rejects.toThrow('temporary');

    shouldFail = false;
    const result = await fn();
    expect(result).toBe('recovered');
  });

  it('should handle rapid sequential resolve-then-call correctly', async () => {
    let callCount = 0;
    let resolvePromise: (() => void) | null = null;

    const fn = dedup(() => {
      callCount++;
      return new Promise<string>((resolve) => {
        resolvePromise = () => resolve(`result-${callCount}`);
      });
    });

    // Start first call
    const p1 = fn();
    const p2 = fn(); // Same as p1
    expect(p1).toBe(p2);

    // Resolve first call
    resolvePromise!();
    const r1 = await p1;
    expect(r1).toBe('result-1');

    // Start new call after resolution
    const p3 = fn();
    expect(p3).not.toBe(p1); // Different promise
    resolvePromise!();
    const r3 = await p3;
    expect(r3).toBe('result-2');
    expect(callCount).toBe(2);
  });

  it('should work with different return types via generics', async () => {
    const numFn = dedup(async () => 42);
    const strFn = dedup(async () => 'hello');
    const objFn = dedup(async () => ({ key: 'value' }));

    expect(await numFn()).toBe(42);
    expect(await strFn()).toBe('hello');
    expect(await objFn()).toEqual({ key: 'value' });
  });
});
