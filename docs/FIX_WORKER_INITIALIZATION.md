# Fix Record: Web Worker OpenCV Initialization

This document records the resolution of the persistent "Worker ... (Stuck)" issue in the FacingSplit application.

## 1. WHY was it buggy? (Root Cause)

The initialization failed due to three conflicting technical constraints:

1.  **Incompatible Worker Typology**: Vite 5+ defaults to `type: "module"` for Web Workers. However, `opencv.js` is a legacy global script that must be loaded via `importScripts()`, which is **blocked** in module workers (throwing `TypeError: Module scripts don't support importScripts()`).
2.  **Syntax Sensitivity**: When the worker was forced to `type: "classic"`, it crashed with `SyntaxError: Unexpected token 'export'`. This occurred because the TypeScript source (and Vite's dev transformation) included `import type` or `export` keywords, which are illegal in classic worker environments.
3.  **Initialization Race Condition**: The internal Emscripten runtime of `opencv.js` initializes asynchronously. Even after `importScripts()` finishes, the `cv` object might not be fully populated immediately. The previous code checked for readiness once and failed if it wasn't instant, leaving the worker in an uninitialized "zombie" state.

---

## 2. HOW was it fixed? (Solution)

The fix involved a three-layered approach to stabilize the worker environment:

### Layer 1: Force "Classic" Mode
In `src/context/WorkerCtx.tsx`, I bypassed the default Vite worker transformation and used the explicit constructor:
```typescript
const worker = new Worker(
  new URL('../workers/processingWorker.ts', import.meta.url),
  { type: 'classic' }
);
```
This signaled to the browser that `importScripts` is permitted.

### Layer 2: Strip ESM Syntax
In `src/workers/processingWorker.ts`, I manually removed all `import` and `export` keywords. 
*   **Imports**: Type imports were replaced with local interface declarations to ensure the file is a pure classic script.
*   **Result**: This resolved the `SyntaxError` and allowed the worker to start successfully in both Dev and Production modes.

### Layer 3: Synchronized Ready Signal
I replaced the fragile check with the canonical OpenCV "Module" pattern and a polling fallback:
```typescript
// Define readiness callback before loading
self.Module = {
  onRuntimeInitialized: () => {
    cvReady = true;
    self.postMessage({ type: 'CV_READY' });
  }
};

// Polling fallback for edge cases
const interval = setInterval(() => {
  if (typeof cv !== 'undefined' && cv.Mat && !cvReady) {
    cvReady = true;
    self.postMessage({ type: 'CV_READY' });
    clearInterval(interval);
  }
}, 100);
```
This ensures the `CV_READY` message is only sent once the heavy OpenCV runtime is actually functional.

## 3. Current Status
- [x] **Main Thread**: OPENCV READY
- [x] **Worker Thread**: WORKER ACTIVE
- [x] **Communication**: Verified via PostMessage tunnel.
