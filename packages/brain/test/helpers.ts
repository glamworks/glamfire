import { expect } from 'vitest';

/** Assert a value is defined and return it narrowed — keeps tests terse without `!`. */
export function def<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  return value as T;
}

/** Dot product of two equal-length vectors. */
export function dot(x: Float32Array, y: Float32Array): number {
  let d = 0;
  for (let i = 0; i < x.length; i++) d += (x[i] ?? 0) * (y[i] ?? 0);
  return d;
}
