# FacingSplit Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Main Thread)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    UI Layer (React)                      │   │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐   │   │
│  │  │   App.tsx  │  │  File Upload │  │ Page Selection  │   │   │
│  │  │  (Provider │  │   Component  │  │   & Controls    │   │   │
│  │  │   Tree)    │  │              │  │                 │   │   │
│  │  └────────────┘  └──────────────┘  └─────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Context Providers                          │   │
│  │  ┌──────────────────┐      ┌─────────────────────────┐   │   │
│  │  │ OpenCvProvider   │      │   WorkerProvider        │   │   │
│  │  │ - Loads opencv.js│      │   - Spawns worker       │   │   │
│  │  │ - Exposes cv ref │      │   - Routes messages     │   │   │
│  │  └──────────────────┘      └─────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Browser Services                           │   │
│  │  ┌──────────────────┐      ┌─────────────────────────┐   │   │
│  │  │  pdfRenderer.ts  │      │ useProcessingStore.ts   │   │   │
│  │  │  - PDF.js wrapper│      │ (Zustand)               │   │   │
│  │  │  - 300 DPI render│      │ - Result cache          │   │   │
│  │  │  - ImageData out │      │ - Queue management      │   │   │
│  │  └──────────────────┘      └─────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │ postMessage(ImageData)
                               │ [Transferable]
┌──────────────────────────────┼─────────────────────────────┐
│                         Web Worker Thread                  │
├──────────────────────────────┼─────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐  
│  │            processingWorker.ts                          │  
│  │                                                         │  
│  │  ┌──────────────────────────────────────────────────┐   │  
│  │  │           ImageData → cv.Mat Pipeline            │   │  
│  │  │                                                  │   │  
│  │  │  1. matFromImageData(imageData)                  │   │  
│  │  │  2. cvtColor(RGBA2GRAY)                          │   │  
│  │  │  3. Run all 3 detection methods:                 │   │  
│  │  │     ┌────────────────────────────────────────┐   │   │  
│  │  │     │  detectByGradient():                   │   │   │  
│  │  │     │  - Sobel(X,Y)                          │   │   │  
│  │  │     │  - convertScaleAbs                     │   │   │  
│  │  │     │  - threshold                           │   │   │  
│  │  │     │  - projectCols → findPeak              │   │   │  
│  │  │     └────────────────────────────────────────┘   │   │  
│  │  │     ┌────────────────────────────────────────┐   │   │  
│  │  │     │  detectByDensity():                    │   │   │  
│  │  │     │  - adaptiveThreshold(BINARY_INV)       │   │   │  
│  │  │     │  - morphologyEx(CLOSE, 15x3)           │   │   │  
│  │  │     │  - connectedComponentsWithStats        │   │   │  
│  │  │     │  - find largest blob centroid          │   │   │  
│  │  │     └────────────────────────────────────────┘   │   │  
│  │  │     ┌────────────────────────────────────────┐   │   │  
│  │  │     │  detectByEdge():                       │   │   │  
│  │  │     │  - Canny(50, 150)                      │   │   │  
│  │  │     │  - morphologyEx(CLOSE, 1x15 vertical)  │   │   │  
│  │  │     │  - ROI center third                    │   │   │  
│  │  │     │  - projectCols → findPeak              │   │   │  
│  │  │     └────────────────────────────────────────┘   │   │  
│  │  │  4. vote([grad, dens, edge]) → best margin       │   │
│  │  │  5. computeCrops(leftMargin, rightMargin)        │   │
│  │  │  6. cleanup() all cv.Mat objects                 │   │
│  │  └──────────────────────────────────────────────────┘   │  
│  └─────────────────────────────────────────────────────────┘  
│                              │                             │
│                              │ postMessage(SplitResult)    │
└──────────────────────────────┼─────────────────────────────┘
                               │
                               ▼
                        Zustand Store Update
                               │
                               ▼
                        React Re-render (Result Display)
```

## Data Flow

### 1. Initialization Phase

```
App mounts
  │
  ├─► OpenCvProvider
  │     └─► Loads /opencv.js via <script>
  │           └─► cv.onRuntimeInitialized → setIsLoaded(true)
  │
  └─► WorkerProvider
        └─► new Worker(processingWorker.ts)
              └─► importScripts('/opencv.js')
                    └─► cv.onRuntimeInitialized
                          └─► postMessage({ type: 'CV_READY' })
                                └─► setIsReady(true)
```

### 2. Processing Phase

```
User uploads PDF
  │
  ▼
usePdfRenderer(pdfUrl)
  │
  ├─► pdfjsLib.getDocument(pdfUrl)
  │     └─► setPdfDoc({ doc, pageCount })
  │
  └─► User clicks "Process Page"
        │
        ▼
      renderPage(pageNum) → ImageData (300 DPI)
        │
        ▼
      sendMessage({
        type: 'PROCESS_PAGE',
        pageNum,
        method,
        imageData  // Transferred, not cloned
      })
        │
        ▼
      processingWorker receives message
        │
        ├─► matFromImageData(imageData)
        ├─► cvtColor(RGBA2GRAY)
        ├─► detectByGradient(gray) → MarginResult
        ├─► detectByDensity(gray) → MarginResult
        ├─► detectByEdge(gray) → MarginResult
        ├─► vote([grad, dens, edge]) → bestMargin
        ├─► computeCrops(leftMargin, rightMargin)
        └─► cleanup() all cv.Mat
              │
              ▼
            postMessage({
              type: 'PAGE_DONE',
              pageNum,
              method,
              result: SplitResult {
                leftMargin: { x, confidence, method },
                rightMargin: { x, confidence, method },
                leftCrop: { x, y, width, height },
                rightCrop: { x, y, width, height }
              }
            })
              │
              ▼
            WorkerCtx.onmessage
              │
              ▼
            useProcessingStore.setPageResult(pageNum, method, result)
              │
              └─► cache[`${pageNum}:${method}`] = { result, timestamp }
                    │
                    ▼
                  React re-renders
                    │
                    ▼
                  App displays result
```

## Type System

### Discriminated Unions

All worker messages use discriminated unions for exhaustive type checking:

```typescript
// TO worker
type WorkerInbound = {
  type: 'PROCESS_PAGE';
  pageNum: number;
  method: DetectMethod;
  imageData: ImageData;
};

// FROM worker
type WorkerOutbound =
  | { type: 'CV_READY' }
  | { type: 'PAGE_DONE'; pageNum: number; method: DetectMethod; result: SplitResult }
  | { type: 'PAGE_ERROR'; pageNum: number; method: DetectMethod; error: string };
```

### Result Types

```typescript
interface MarginResult {
  x: number;           // X-coordinate of detected binding
  confidence: number;  // 0-1 score
  method: DetectMethod; // 'gradient' | 'density' | 'edge'
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SplitResult {
  leftMargin: MarginResult;
  rightMargin: MarginResult;
  leftCrop: CropBox;
  rightCrop: CropBox;
}
```

## Memory Management

### cv.Mat Lifecycle

Every `cv.Mat` object must be explicitly deleted to avoid memory leaks:

```typescript
// Track all allocated matrices
const matTracker = new Set<any>();

function track(mat: any): any {
  matTracker.add(mat);
  return mat;
}

function cleanup() {
  matTracker.forEach(mat => mat.delete());
  matTracker.clear();
}

// Usage
try {
  const gray = track(new cv.Mat());
  const edges = track(new cv.Mat());
  // ... processing
} finally {
  cleanup(); // Always runs, even on error
}
```

### ImageData Transfer

ImageData is transferred (not cloned) to the worker for zero-copy semantics:

```typescript
// Main thread
postMessage({
  type: 'PROCESS_PAGE',
  imageData
}, [imageData.data.buffer]); // Transfer ArrayBuffer

// After this, main thread's imageData is neutered
```

## Detection Method Details

### Gradient Method

**Best for:** Sharp binding shadows, clean scans

**Pipeline:**
1. `Sobel(X)` + `Sobel(Y)` → edge gradients
2. `convertScaleAbs` → absolute values
3. `addWeighted(0.5, 0.5)` → combine X and Y
4. `threshold(50, 255)` → binary edges
5. `projectCols` → sum each column
6. `findPeak` → find maximum in center region

**Confidence:** Based on peak sharpness vs. average

### Density Method

**Best for:** Low-contrast bindings, uniform backgrounds

**Pipeline:**
1. `adaptiveThreshold(BINARY_INV)` → invert to make content white
2. `morphologyEx(CLOSE, 15x3)` → connect nearby components horizontally
3. `connectedComponentsWithStats` → find blobs
4. Find largest blob (excluding background)
5. Return centroid X coordinate

**Confidence:** Blob area / (total pixels × 0.1)

### Edge Method

**Best for:** Complex layouts, decorative bindings

**Pipeline:**
1. `Canny(50, 150)` → edge detection
2. `morphologyEx(CLOSE, 1x15)` → connect vertical edges
3. Extract center-third ROI (cols 33%-67%)
4. `projectCols` on ROI
5. `findPeak` → find maximum

**Confidence:** Peak height / (rows × 0.3)

## Voting Strategy

All three methods run independently on each page. The final margin is the result with the highest confidence score:

```typescript
function vote(results: MarginResult[]): MarginResult {
  return results.reduce((best, curr) =>
    curr.confidence > best.confidence ? curr : best
  );
}
```

This handles cases where one method excels while others fail, without manual method selection.

## Caching Strategy

Results are cached in Zustand store with composite key:

```typescript
cache[`${pageNum}:${method}`] = {
  result: SplitResult,
  timestamp: Date.now()
};
```

- Different methods on the same page get separate cache entries
- Allows comparing methods without reprocessing
- Cache survives React re-renders but resets on page reload
- Future: Could persist to IndexedDB for cross-session caching

## Error Handling

### Worker Errors

```typescript
try {
  // Processing logic
} catch (err) {
  postMessage({
    type: 'PAGE_ERROR',
    pageNum,
    method,
    error: err.message
  });
} finally {
  cleanup(); // Always free cv.Mat objects
}
```

### Main Thread

```typescript
worker.onmessage = (e) => {
  if (e.data.type === 'PAGE_ERROR') {
    useProcessingStore.setPageError(
      e.data.pageNum,
      e.data.method,
      e.data.error
    );
  }
};
```

Errors are stored in the same cache structure, allowing UI to show error state without crashing.

## Performance Characteristics

### Initialization
- OpenCV.js WASM load: ~2-3 seconds (8 MB file)
- Worker spawn: ~50 ms
- Total startup: ~3 seconds cold, instant warm

### Per-Page Processing
- PDF render (300 DPI): 200-400 ms
- ImageData transfer: ~1 ms (zero-copy)
- OpenCV processing: 150-300 ms
- Total: ~400-700 ms per page

### Memory Usage
- 300 DPI page: ~25-40 MB ImageData
- OpenCV intermediate Mats: ~100-150 MB peak
- Result cache: ~1 KB per page
- Total per page: ~150-200 MB peak, ~1 KB persistent

## Future Optimizations

1. **Worker Pool:** Process multiple pages in parallel
2. **Progressive Rendering:** Low-res preview → full-res split
3. **WASM SIMD:** Enable OpenCV SIMD instructions
4. **IndexedDB Cache:** Persist results across sessions
5. **Adaptive DPI:** Reduce DPI for large pages to save memory
6. **Incremental Voting:** Stop early if one method has very high confidence
