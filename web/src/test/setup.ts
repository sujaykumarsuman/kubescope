import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no matchMedia. Provide a controllable stub whose `matches` reads a
// mutable global, so theme tests can simulate the OS preferring dark by setting
// `(globalThis as { __prefersDark?: boolean }).__prefersDark = true`.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      media: query,
      get matches() {
        return Boolean((globalThis as { __prefersDark?: boolean }).__prefersDark);
      },
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

// jsdom does provide localStorage/sessionStorage, but they can be missing from
// the test global on a newer Node. Node >=22 ships its own Web Storage globals,
// and `localStorage` there is inert unless --localstorage-file is passed; vitest
// keeps a jsdom window key only when Node's globalThis lacks it or vitest
// allowlists it, and these two were allowlisted only in vitest 5. So on Node 26
// the inert Node global shadows jsdom's Storage and `localStorage` reads as
// undefined. Rebind both to this environment's own jsdom window — the real
// Storage (same realm as `window.Storage`, reset per test file), not a stub.
const { jsdom } = globalThis as {
  jsdom?: { window: Pick<Window, "localStorage" | "sessionStorage"> };
};
if (jsdom) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get: () => jsdom.window[key],
      // Keep assignment working, the way vitest's own global bindings do, so a
      // test can still swap in its own Storage double.
      set: (value: Storage) => {
        Object.defineProperty(globalThis, key, {
          value,
          configurable: true,
          writable: true,
        });
      },
    });
  }
}

// vitest runs without global injection, so React Testing Library's automatic
// afterEach cleanup isn't registered — do it here to unmount between tests.
afterEach(() => {
  cleanup();
});
