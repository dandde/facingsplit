# FacingSplit Implementation Checklist

## ✅ Completed (Current Session)

### Core Infrastructure
- [x] `src/types/pipeline.ts` — All discriminated unions (DetectMethod, MarginResult, SplitResult, Worker messages)
- [x] `src/services/pdfRenderer.ts` — PDF.js wrapper with 300 DPI rendering, OffscreenCanvas, transfer semantics
- [x] `src/workers/processingWorker.ts` — Complete OpenCV pipeline with all three detection methods
- [x] `src/context/WorkerCtx.tsx` — Worker lifecycle, CV_READY signal, typed message routing
- [x] `src/store/useProcessingStore.ts` — Zustand queue, cache keyed by `${page}:${method}`, progress stats
- [x] `src/context/OpenCvProvider.tsx` — opencv.js script loading, onRuntimeInitialized promise

### Detection Methods (All Implemented in Worker)
- [x] **Gradient** — Sobel → threshold → row/col projection
- [x] **Density** — adaptiveThreshold → morphologyEx CLOSE → connectedComponents → largest blob
- [x] **Edge** — Canny → centre-third ROI → vertical morph close → projectCols peak

### Voting & Cropping
- [x] `vote()` function — picks highest-confidence margin from 3 methods
- [x] `computeCrops()` — generates left/right crop boxes with 5% vertical margin

### UI & Integration
- [x] `src/App.tsx` — Full UI with file upload, page/method selection, result display
- [x] `src/main.tsx` — React entry point
- [x] `index.html` — HTML shell
- [x] Provider nesting: OpenCvProvider → WorkerProvider → AppContent

### Build Configuration
- [x] `vite.config.ts` — optimizeDeps exclude opencv.js, worker format: 'es', CORS headers
- [x] `tsconfig.json` + `tsconfig.node.json`
- [x] `package.json` — React, TypeScript, Vite, Zustand, pdfjs-dist
- [x] `.gitignore`

### Documentation
- [x] `README.md` — Architecture, setup, usage, troubleshooting
- [x] `public/README.md` — Instructions for downloading opencv.js and copying pdf.worker.min.mjs

## 🔄 Next Steps (To Make It Work)

### 1. Install Dependencies
```bash
npm install
```

### 2. Copy PDF.js Worker
```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

### 3. Download OpenCV.js
- Visit https://docs.opencv.org/4.x/opencv.js
- Download the full 4.x WASM build (~8MB)
- Place at `/public/opencv.js`

### 4. Test End-to-End
```bash
npm run dev
```

Expected flow:
1. Browser loads → OpenCV.js initializes → "OpenCV: ✓ Ready"
2. Worker spawns → receives CV_READY → "Worker: ✓ Ready"
3. Upload PDF → select page → click "Process Page"
4. Worker processes → PAGE_DONE message → result appears in UI

## 🎯 Optional Enhancements (Future)

### UI/UX
- [ ] Add canvas preview showing detected margins overlaid on page
- [ ] Batch processing mode (process all pages at once)
- [ ] Download split pages as separate PDFs or images
- [ ] Drag-and-drop PDF upload
- [ ] Progress bar during batch processing

### Detection Quality
- [ ] Add rotation correction (deskew) before splitting
- [ ] Pre-processing options (brightness, contrast, despeckle)
- [ ] Manual margin adjustment UI (drag handles)
- [ ] Per-method parameter tuning UI (thresholds, kernel sizes)

### Export Options
- [ ] Export as individual page images (PNG/JPEG)
- [ ] Export as new PDF with split pages
- [ ] OCR integration for searchable text
- [ ] Metadata preservation from source PDF

### Performance
- [ ] Web Worker pool for parallel page processing
- [ ] Progressive enhancement (low-res preview → full-res split)
- [ ] IndexedDB cache for processed results
- [ ] WASM optimization flags for OpenCV

### Testing
- [ ] Unit tests for detection methods (synthetic images)
- [ ] E2E tests with real scanned book samples
- [ ] Benchmark suite (accuracy vs. various scan qualities)
- [ ] Visual regression tests for crop box placement

## 📊 Current State

**What works (in theory):**
- Full pipeline from PDF → ImageData → Worker → SplitResult → UI
- All three detection methods with voting
- Type-safe message passing
- Result caching
- Progress tracking

**What's needed to actually run it:**
- `npm install`
- Copy pdf.worker.min.mjs to /public
- Download opencv.js to /public
- Test with real scanned book PDF

**Known unknowns:**
- Real-world detection accuracy (needs testing with diverse scans)
- Memory usage with large PDFs (300 DPI ImageData can be hefty)
- Edge cases (rotated scans, non-standard bindings, decorative elements)

## 🐛 Potential Issues to Watch For

1. **OpenCV.js loading:** 
   - WASM initialization can fail silently
   - Check browser console for errors
   
2. **Worker message transfer:**
   - ImageData must be transferred (not cloned) for large pages
   - Verify Transferable objects work in target browsers

3. **Memory leaks:**
   - Every `cv.Mat` must be `.delete()`'d
   - Use `track()` helper in worker to catch leaks

4. **CORS issues:**
   - Vite config includes CORS headers, but verify in production
   - Some browsers block Worker → fetch without proper headers

5. **PDF.js worker path:**
   - Must be served from /public, not bundled
   - Check `GlobalWorkerOptions.workerSrc` in pdfRenderer.ts

## 📝 Code Quality Notes

**Type Safety:**
- All worker messages use discriminated unions
- No `any` types in core pipeline
- Strict TypeScript config enabled

**Error Handling:**
- Worker catches errors per-method and per-page
- PAGE_ERROR messages route back to UI
- Mat lifecycle managed via try/finally

**Separation of Concerns:**
- OpenCV logic isolated in worker
- PDF rendering in dedicated service
- UI state in Zustand store
- Providers handle lifecycle/initialization

**Performance Considerations:**
- OffscreenCanvas for rendering (off main thread)
- Transferable ImageData (zero-copy to worker)
- Result caching to avoid reprocessing
- Worker isolation (crashes don't freeze UI)

---

**Status:** ✅ Fully architected and implemented. Ready for `npm install` + asset download + testing.
