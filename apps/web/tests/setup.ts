/**
 * Vitest setup. Runs once per test file before any test executes.
 *
 * In Sprint B1 we run in the `jsdom` environment so component
 * tests can use DOM APIs (`document`, `localStorage`, etc.). The
 * `localStorage` polyfill jsdom provides is enough for our auth
 * stub; we just clear it between tests so the stub's stored
 * state never leaks.
 */
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

afterEach(() => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
