import '@testing-library/jest-dom';

// jsdom has no layout engine: offsetHeight/clientHeight/scrollHeight/scrollTop
// stay 0 and getBoundingClientRect returns all zeros, which breaks any component
// that measures DOM geometry (Virtualized, Artwork, sliders). We provide sane
// non-zero defaults; individual tests can override per-element via
// Object.defineProperty on the specific node.
class MockResizeObserver implements ResizeObserver {
  readonly observe = () => {};
  readonly unobserve = () => {};
  readonly disconnect = () => {};
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

// requestAnimationFrame must run synchronously in tests so useLayoutEffect
// measurements apply before assertions. jsdom polyfills rAF but asynchronously;
// flush it on a microtask by resolving immediately.
const origRAF = globalThis.requestAnimationFrame;
if (origRAF && origRAF.toString().includes('[native code]')) {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
}
