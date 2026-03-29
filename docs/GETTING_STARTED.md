# Getting Started with FacingSplit

## Quick Start (5 minutes)

### Step 1: Install Dependencies (2 min)

```bash
npm install
```

This installs:
- React 18 + TypeScript
- Vite (build tool)
- Zustand (state management)
- PDF.js (PDF rendering)

### Step 2: Copy PDF.js Worker (<1 min)

```bash
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

### Step 3: Download OpenCV.js (2 min)

**Option A: Direct Download**
1. Go to: https://docs.opencv.org/4.x/opencv.js
2. Save to `/public/opencv.js`

**Option B: From CDN (for testing)**
```bash
curl -o public/opencv.js https://docs.opencv.org/4.x/opencv.js
```

**Important:** The file is ~8 MB. Make sure you get the full WASM build.

### Step 4: Run Development Server

```bash
npm run dev
```

Open http://localhost:5173

## First Test

### What You'll See

1. **Status Indicators:**
   - "OpenCV: ⏳ Loading..." → "OpenCV: ✓ Ready" (2-3 seconds)
   - "Worker: ⏳ Loading..." → "Worker: ✓ Ready" (after OpenCV loads)

2. **File Upload:**
   - Click "Choose File"
   - Select a scanned book PDF (facing pages)

3. **Controls:**
   - Page number selector
   - Method dropdown (gradient/density/edge)
   - "Process Page" button

### Expected Behavior

1. Upload PDF → page count appears
2. Select page 1, method "gradient"
3. Click "Process Page"
4. Console shows:
   ```
   [PdfRenderer] Rendering page 1 at 300 DPI: 2100x2700px
   [Worker] Processing page 1 (gradient method)
   [Worker] Gradient: bindingX=1050 (conf=0.85), Density: bindingX=1048...
   [Worker] Vote winner: gradient (confidence=0.85)
   [WorkerCtx] Page 1 done (gradient)
   ```
5. Result appears showing margin coordinates and crop boxes

## Troubleshooting

### "OpenCV: ⏳ Loading..." never completes

**Cause:** opencv.js not found or failed to load

**Fix:**
```bash
# Check if file exists
ls -lh public/opencv.js

# Should be ~8 MB
# If missing, re-download from opencv.org
```

### "Worker: ⏳ Loading..." stuck after OpenCV loads

**Cause:** Worker can't load opencv.js

**Check:**
- Browser console for errors
- Network tab: verify opencv.js loads twice (main + worker)
- CORS headers: verify Vite config has proper headers

### "Failed to render page"

**Cause:** PDF.js worker not found

**Fix:**
```bash
# Verify worker exists
ls -lh public/pdf.worker.min.mjs

# If missing, copy from node_modules
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

### Low confidence results (<0.5)

**Not necessarily a bug!** This means:
- Binding is unclear in the scan
- Try different methods (gradient/density/edge)
- Some scans need preprocessing (rotation, contrast)

### "Out of memory" errors

**Cause:** Large PDF at 300 DPI uses a lot of RAM

**Workarounds:**
- Process smaller batches
- Reduce DPI in `pdfRenderer.ts` (change `DPI = 300` to `DPI = 200`)
- Close other browser tabs

## Project Structure

```
/home/claude/
├── src/
│   ├── types/
│   │   └── pipeline.ts          # Type definitions
│   ├── services/
│   │   └── pdfRenderer.ts       # PDF → ImageData
│   ├── workers/
│   │   └── processingWorker.ts  # OpenCV pipeline
│   ├── context/
│   │   ├── OpenCvProvider.tsx   # OpenCV loader
│   │   └── WorkerCtx.tsx        # Worker manager
│   ├── store/
│   │   └── useProcessingStore.ts # Zustand state
│   ├── App.tsx                  # Main UI
│   └── main.tsx                 # Entry point
├── public/
│   ├── opencv.js                # ← Download this (8 MB)
│   └── pdf.worker.min.mjs       # ← Copy from node_modules
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## Key Files

### Must Download/Copy
- `/public/opencv.js` — OpenCV.js WASM build
- `/public/pdf.worker.min.mjs` — PDF.js worker

### Core Logic
- `src/workers/processingWorker.ts` — All detection algorithms
- `src/types/pipeline.ts` — Type definitions
- `src/services/pdfRenderer.ts` — PDF rendering

### React Integration
- `src/App.tsx` — Main UI
- `src/context/` — OpenCV and Worker providers
- `src/store/` — Zustand state management

## Testing Different PDFs

### Good Test Cases

**High-quality scans:**
- Clean binding shadow
- Uniform page background
- Text-heavy content
- Expected: High confidence (>0.7) with gradient method

**Medium-quality scans:**
- Slight rotation
- Variable lighting
- Mixed content (text + images)
- Expected: Try all three methods, one should work

**Challenging scans:**
- Decorative bindings
- Colored backgrounds
- Minimal shadow
- Expected: Lower confidence, may need preprocessing

### Test Strategy

For each PDF:
1. Process page 1 with **gradient** first
2. If confidence <0.6, try **density**
3. If still low, try **edge**
4. Compare results side-by-side

## Next Steps

### Add Visual Preview

Create a canvas component to overlay detected margins:

```typescript
// src/components/PageCanvas.tsx
function PageCanvas({ imageData, result }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !imageData) return;
    
    const ctx = canvasRef.current.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    
    // Draw detected margins
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(result.leftMargin.x, 0);
    ctx.lineTo(result.leftMargin.x, imageData.height);
    ctx.stroke();
  }, [imageData, result]);
  
  return <canvas ref={canvasRef} />;
}
```

### Batch Processing

Process all pages at once:

```typescript
async function processAllPages() {
  for (let i = 1; i <= pageCount; i++) {
    const imageData = await renderPage(i);
    sendMessage({ type: 'PROCESS_PAGE', pageNum: i, method, imageData });
  }
}
```

### Export Split Pages

Add download button:

```typescript
function downloadSplitPages(result: SplitResult, imageData: ImageData) {
  // Create canvases for left and right crops
  const leftCanvas = document.createElement('canvas');
  leftCanvas.width = result.leftCrop.width;
  leftCanvas.height = result.leftCrop.height;
  
  const ctx = leftCanvas.getContext('2d')!;
  ctx.putImageData(
    imageData, 
    -result.leftCrop.x, 
    -result.leftCrop.y
  );
  
  // Convert to blob and download
  leftCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'page-left.png';
    a.click();
  });
  
  // Repeat for right page...
}
```

## Common Workflows

### Workflow 1: Quick Single Page Split

1. Upload PDF
2. Select page
3. Click "Process Page"
4. View result
5. Download split images (if implemented)

### Workflow 2: Compare Detection Methods

1. Upload PDF
2. Select page
3. Process with "gradient"
4. Note confidence score
5. Process same page with "density"
6. Compare results
7. Use method with higher confidence

### Workflow 3: Batch Process Book

1. Upload PDF
2. Implement batch loop (see above)
3. Process all pages
4. Review results in cache
5. Export all split pages

## Development Tips

### Hot Module Reload

Vite supports HMR. Edit any file and see changes instantly:
- UI changes: instant
- Worker changes: requires page reload (worker re-spawns)
- OpenCV.js changes: requires hard refresh

### Debugging Worker

Add `console.log` in `processingWorker.ts`:

```typescript
console.log('[Worker] Gray mat size:', gray.rows, gray.cols);
console.log('[Worker] Projection:', colProj);
```

Check browser console → select "Worker" context in dropdown.

### Testing Detection Methods

Create synthetic test images:

```typescript
// Generate solid vertical line at x=500
const testImage = new ImageData(1000, 1000);
for (let y = 0; y < 1000; y++) {
  const idx = (y * 1000 + 500) * 4;
  testImage.data[idx] = 0;     // R
  testImage.data[idx+1] = 0;   // G
  testImage.data[idx+2] = 0;   // B
  testImage.data[idx+3] = 255; // A
}

// Should detect binding at x=500 with high confidence
```

## Resources

- **OpenCV.js Docs:** https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html
- **PDF.js Docs:** https://mozilla.github.io/pdf.js/
- **Zustand Docs:** https://docs.pmnd.rs/zustand/getting-started/introduction
- **Vite Docs:** https://vitejs.dev/guide/

## Support

For issues:
1. Check browser console for errors
2. Verify all files in `/public` exist
3. Try different PDFs to isolate the issue
4. Check ARCHITECTURE.md for system internals

---

**You're all set!** Run `npm run dev` and start splitting pages. 📖✂️
