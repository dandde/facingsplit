# FacingSplit 📖✂️

**Scanned book PDF page splitter** — detects center binding and splits facing pages in-browser using React, TypeScript, and OpenCV.js.

### 🚀 [Live Demo](https://dandde.github.io/facingsplit/)

## Architecture

**3-Layer Design:**
1. **UI Layer** (React components) — file upload, page selection, result display
2. **Browser Services** — PDF.js rendering at 300 DPI, React hooks
3. **OpenCV Pipeline** (Web Worker) — three detection methods, voting, cropping, CLAHE enhancement

### Detection Methods

All three methods run on each page; final result is determined by voting on highest-confidence margin detections:

1. **Gradient** (`detectByGradient`)
   - Sobel edge detection → threshold → row/column projection
   - Best for: Sharp binding shadows, clean scans

2. **Density** (`detectByDensity`)
   - Adaptive threshold → morphological closing → connected components
   - Best for: Low-contrast bindings, uniform backgrounds

3. **Edge** (`detectByEdge`)
   - Canny edge detection → vertical morphology → center ROI peak finding
   - Best for: Complex page layouts, decorative bindings

### Component Tree

```
App (OpenCvProvider → WorkerProvider)
├── File upload → pdfUrl state
├── usePdfRenderer(pdfUrl) → renderPage(pageNum) → ImageData
├── Controls (page, method) → handleProcessPage
└── useProcessingStore → getResult(page, method) → SplitResult display
```

### Data Flow

```
PDF file → renderPage → ImageData
                          ↓
        WorkerCtx.sendMessage({ type: 'PROCESS_PAGE', imageData, ... })
                          ↓
        processingWorker.ts (OpenCV pipeline)
                          ↓
        { type: 'PAGE_DONE', result: SplitResult }
                          ↓
        useProcessingStore.setPageResult(pageNum, method, result)
                          ↓
        UI updates with crop coordinates
```

## Project Structure

```
/src
  /context
    OpenCvProvider.tsx    # Loads opencv.js, exposes cv ref
    WorkerCtx.tsx         # Spawns worker, routes messages
  /services
    pdfRenderer.ts        # PDF.js → 300 DPI ImageData
  /workers
    processingWorker.ts   # All OpenCV detection logic
  /store
    useProcessingStore.ts # Zustand: queue, cache, progress
  /types
    pipeline.ts           # DetectMethod, MarginResult, SplitResult unions
  App.tsx                 # Main UI
  main.tsx                # React entry point

/public
  opencv.js               # OpenCV.js WASM build (download separately)
  pdf.worker.min.mjs      # From pdfjs-dist package
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Copy PDF.js worker

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

### 3. Download OpenCV.js

Download the full OpenCV.js build (with WASM) from:
https://docs.opencv.org/4.x/opencv.js

Place it at `/public/opencv.js`

**Note:** The file is ~8MB. Make sure to get the 4.x version with full WASM support.

### 4. Run dev server

```bash
npm run dev
```

Open `http://localhost:5173`

## Usage

1. **Upload a PDF** — scanned book with facing pages
2. **Select page and method** — try all three detection methods
3. **Click "Process Page"** — results appear below with margin coordinates and crop boxes
4. **Compare methods** — switch between gradient/density/edge to see which works best for your scan

## Testing End-to-End

### Quick sanity check:

1. Wait for "OpenCV: ✓ Ready" and "Worker: ✓ Ready"
2. Upload any facing-page PDF
3. Process page 1 with "Gradient" method
4. Check console for `[WorkerCtx] Page 1 done (gradient)`
5. Result should appear showing left/right margins with confidence scores

### What to look for in results:

- **High confidence (>0.7):** Binding clearly detected
- **Low confidence (<0.5):** Ambiguous, try another method
- **Crop boxes:** Should split page roughly in half, with some margin overlap

### Console messages to expect:

```
[OpenCvProvider] OpenCV.js runtime initialized
[WorkerCtx] OpenCV.js ready in worker
[Worker] Processing page 1 (gradient method)
[Worker] Gradient: bindingX=1050 (conf=0.85), Density: bindingX=1048 (conf=0.78)
[Worker] Vote winner: gradient (confidence=0.85)
[WorkerCtx] Page 1 done (gradient)
```

## Type System

All pipeline messages use discriminated unions for type safety:

### `WorkerInbound`
```typescript
{ type: 'PROCESS_PAGE', pageNum, method, imageData }
```

### `WorkerOutbound`
```typescript
{ type: 'CV_READY' }
{ type: 'PAGE_DONE', pageNum, method, result: SplitResult }
{ type: 'PAGE_ERROR', pageNum, method, error }
```

### `SplitResult`
```typescript
{
  leftMargin: { x, confidence, method },
  rightMargin: { x, confidence, method },
  leftCrop: { x, y, width, height },
  rightCrop: { x, y, width, height },
}
```

## Caching Strategy

Results are cached in Zustand store by key: `${pageNum}:${method}`

- Re-processing the same page+method retrieves cached result
- Different methods on same page each get their own cache entry
- Store survives React re-renders but resets on page reload

## Performance Notes

- **First load:** OpenCV.js takes ~2-3 seconds to initialize WASM runtime
- **Per-page:** Processing takes 200-500ms depending on resolution and complexity
- **Memory:** Each 300 DPI page ~ 25-40 MB of `ImageData` + intermediate `cv.Mat` objects
- **Worker isolation:** Crashes in OpenCV won't affect main UI thread

## Troubleshooting

### "Worker not ready"
- Check browser console for opencv.js load errors
- Verify `/public/opencv.js` exists and is the full WASM build

### "Failed to render page"
- Check `/public/pdf.worker.min.mjs` exists
- Verify PDF is not corrupted

### "Low confidence results"
- Try all three methods (gradient, density, edge)
- Some scans benefit from preprocessing (rotation, deskew) before splitting

### OpenCV errors in worker
- Check worker console for `cv.Mat` lifecycle errors
- Verify `track(mat)` is called for all allocated matrices

## Development

### Adding a new detection method:

1. Add method name to `DetectMethod` union in `types/pipeline.ts`
2. Implement `detectByNewMethod(src: Mat): MarginResult` in `processingWorker.ts`
3. Add to `ALL_METHODS` array
4. Update UI dropdown in `App.tsx`

### Modifying crop logic:

Edit `computeCrops()` in `processingWorker.ts`. Current logic:
- Left crop: `[0, leftMargin.x]`
- Right crop: `[rightMargin.x, width]`
- Includes 5% vertical margin by default

## License

MIT

---

Built with React 18, TypeScript 5, OpenCV.js 4.x, PDF.js 3.x, Zustand 4
