/// <reference lib="webworker" />

// Local type definitions to satisfy 'classic' worker constraints (no imports/exports)
type DetectMethod = 'gradient' | 'density' | 'edge';

interface MarginResult {
  x: number;               // X-coordinate of detected split point
  confidence: number;      // 0-1 confidence score
  method: DetectMethod;
  contentXStart?: number;  // Detected start of content area
  contentXEnd?: number;    // Detected end of content area
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

interface ThresholdParams {
  claheClip: number;
  binaryThresh: number;
  adaptiveBlockSize: number;
  adaptiveC: number;
  cannyLow: number;
  cannyHigh: number;
}

type WorkerInbound =
  | { type: 'INIT'; baseUrl: string }
  | {
      type: 'PROCESS_PAGE';
      pageNum: number;
      method: DetectMethod;
      imageData: ImageData;
      params?: ThresholdParams;
    };

type WorkerOutbound =
  | { type: 'CV_READY' }
  | { type: 'CV_INITIALIZING' }
  | {
      type: 'PAGE_DONE';
      pageNum: number;
      method: DetectMethod;
      result: SplitResult;
    }
  | {
      type: 'PAGE_ERROR';
      pageNum: number;
      method: DetectMethod;
      error: string;
    };


// OpenCV.js types (minimal declarations)
declare const cv: any;

// Track allocated cv.Mat objects for cleanup
const matTracker = new Set<any>();

function track(mat: any): any {
  matTracker.add(mat);
  return mat;
}

function cleanup() {
  matTracker.forEach((mat) => {
    try {
      mat.delete();
    } catch (e) {
      // Already deleted, ignore
    }
  });
  matTracker.clear();
}

// OpenCV initialization state
let cvReady = false;

// Eager initialization
console.log('[Worker] Initializing splitting engine...');
self.postMessage({ type: 'CV_INITIALIZING' } as WorkerOutbound);

// canonical way to handle opencv asynchronously
(self as any).Module = {
  onRuntimeInitialized: () => {
    console.log('[Worker] OpenCV.js onRuntimeInitialized called');
    if (!cvReady) {
      cvReady = true;
      self.postMessage({ type: 'CV_READY' } as WorkerOutbound);
    }
  }
};

// Main message handler
self.onmessage = async (e: MessageEvent<WorkerInbound>) => {
  const msg = e.data;

  if (msg.type === 'INIT') {
    const { baseUrl } = msg;
    const scriptPath = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}opencv.js`;
    
    try {
      console.log(`[Worker] Received INIT, loading opencv.js from ${scriptPath}...`);
      importScripts(scriptPath);
      console.log('[Worker] opencv.js script loaded into scope');
      
      // polling fallback if onRuntimeInitialized is missed or already fired
      const checkCV = () => {
        if (typeof cv !== 'undefined' && cv.Mat && !cvReady) {
          console.log('[Worker] OpenCV.js detected via polling');
          cvReady = true;
          self.postMessage({ type: 'CV_READY' } as WorkerOutbound);
          return true;
        }
        return false;
      };

      if (!checkCV()) {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (checkCV() || attempts > 100) { // 10s timeout
            clearInterval(interval);
            if (attempts > 100 && !cvReady) {
              console.error('[Worker] OpenCV initialization timed out');
            }
          }
        }, 100);
      }
    } catch (err) {
      console.error('[Worker] importScripts failed:', err);
    }
    return;
  }

  if (msg.type === 'PROCESS_PAGE') {
    if (!cvReady) {
      console.warn('[Worker] Page received before OpenCV ready. This should be handled by UI state.');
    }
    
    try {
      processPage(msg.pageNum, msg.method, msg.imageData, msg.params);
    } catch (err) {
      self.postMessage({
        type: 'PAGE_ERROR',
        pageNum: msg.pageNum,
        method: msg.method,
        error: 'Engine error: ' + String(err)
      } as WorkerOutbound);
    }
  }
};

/**
 * Process a single page with the specified detection method
 */
function processPage(pageNum: number, method: DetectMethod, imageData: ImageData, params?: ThresholdParams) {
  console.log(`[Worker] Processing page ${pageNum} (${method} method) with custom thresholds`);

  const defaults: ThresholdParams = {
    claheClip: 2.0,
    binaryThresh: 30,
    adaptiveBlockSize: 11,
    adaptiveC: 2,
    cannyLow: 50,
    cannyHigh: 150,
  };

  const p = { ...defaults, ...params };

  try {
    // Convert ImageData to cv.Mat
    const src = track(cv.matFromImageData(imageData));
    
    // Grayscale and threshold for content detection
    const gray = track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Enhance contrast (CLAHE)
    const enhanced = track(new cv.Mat());
    const clahe = track(new cv.CLAHE(p.claheClip, new cv.Size(8, 8)));
    clahe.apply(gray, enhanced);
    clahe.delete();

    // Run all three detection methods
    const gradientRes = detectByGradient(enhanced, p);
    const densityRes = detectByDensity(enhanced, p);
    const edgeRes = detectByEdge(enhanced, p);

    console.log(
      `[Worker] Gradient: x=${gradientRes.x} (conf=${gradientRes.confidence.toFixed(2)}), ` +
      `Density: x=${densityRes.x} (conf=${densityRes.confidence.toFixed(2)}), ` +
      `Edge: x=${edgeRes.x} (conf=${edgeRes.confidence.toFixed(2)})`
    );

    // Vote for the best method result
    let bestRes: MarginResult;
    if (method === 'gradient') bestRes = gradientRes;
    else if (method === 'density') bestRes = densityRes;
    else if (method === 'edge') bestRes = edgeRes;
    else bestRes = vote([gradientRes, densityRes, edgeRes]);

    console.log(`[Worker] Best result from ${bestRes.method} at ${bestRes.x}`);

    // Python prototype style cropping: 
    // The detect methods now (should) focus on the content.
    // We compute the crops based on the detected binding point 'x' 
    // and optionally the detected margins if we want to be fancy.
    
    const result: SplitResult = computeSplitResult(bestRes, imageData.width, imageData.height);

    // Send success message
    const outMsg: WorkerOutbound = {
      type: 'PAGE_DONE',
      pageNum,
      method,
      result,
    };
    self.postMessage(outMsg);
  } catch (err) {
    console.error(`[Worker] Error processing page ${pageNum}:`, err);
    const errMsg: WorkerOutbound = {
      type: 'PAGE_ERROR',
      pageNum,
      method,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errMsg);
  } finally {
    cleanup();
  }
}

/**
 * Compute final crops based on detected content margins.
 * Perfectly balances the left and right pages by splitting the content area in half.
 * This matches the logic from the Python prototype (x + w/2).
 */
function computeSplitResult(margin: MarginResult, width: number, height: number): SplitResult {
   // Use detected content bounds or default to image edges
   const xStart = margin.contentXStart ?? 0;
   const xEnd = margin.contentXEnd ?? width;
   const contentWidth = xEnd - xStart;

   // Split point is the mathematical center of the content
   const bindingX = xStart + Math.floor(contentWidth / 2);
   
   // Apply vertical padding (5%)
   const vPad = Math.floor(height * 0.05);
   const cropHeight = height - 2 * vPad;

   // Left page: from 0 to bindingX (preserve outer left margin)
   const leftCrop: CropBox = {
     x: 0,
     y: vPad,
     width: bindingX,
     height: cropHeight,
   };

   // Right page: from bindingX to width (preserve outer right margin)
   const rightCrop: CropBox = {
     x: bindingX,
     y: vPad,
     width: width - bindingX,
     height: cropHeight,
   };

   return {
     leftMargin: { ...margin, x: bindingX },
     rightMargin: { ...margin, x: bindingX },
     leftCrop,
     rightCrop
   };
}

/**
 * Method 1: Gradient-based detection
 * Sobel → convertScaleAbs → addWeighted → threshold → row/col projection
 */
function detectByGradient(gray: any, p: ThresholdParams): MarginResult {
  try {
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    
    const gradX = track(new cv.Mat());
    const gradY = track(new cv.Mat());
    const absGradX = track(new cv.Mat());
    const absGradY = track(new cv.Mat());
    const grad = track(new cv.Mat());
    const binary = track(new cv.Mat());

    // Sobel gradient
    cv.Sobel(blurred, gradX, cv.CV_16S, 1, 0, 3);
    cv.Sobel(blurred, gradY, cv.CV_16S, 0, 1, 3);
    cv.convertScaleAbs(gradX, absGradX);
    cv.convertScaleAbs(gradY, absGradY);
    cv.addWeighted(absGradX, 0.5, absGradY, 0.5, 0, grad);

    // Dynamic thresholding
    cv.threshold(grad, binary, p.binaryThresh, 255, cv.THRESH_BINARY);

    // Identify Overall Content Boundaries
    const vProj = projectCols(binary);
    // Python uses mean * 0.1
    const vAvg = vProj.reduce((a, b) => a + b, 0) / vProj.length;
    const vThresh = vAvg * 0.1;
    
    let contentStart = 0;
    for (let i = 0; i < vProj.length; i++) {
        if (vProj[i] > vThresh) { contentStart = i; break; }
    }
    let contentEnd = vProj.length - 1;
    for (let i = vProj.length - 1; i >= 0; i--) {
        if (vProj[i] > vThresh) { contentEnd = i; break; }
    }

    const contentWidth = contentEnd - contentStart;
    const bindingX = contentStart + Math.floor(contentWidth / 2);
    const confidence = computeConfidence(vProj, bindingX);

    return {
      x: bindingX,
      confidence: Math.max(0.1, confidence), // Ensure some confidence if content was found
      method: 'gradient',
      contentXStart: contentStart,
      contentXEnd: contentEnd,
    };

  } catch (err) {
    console.error('[Worker] Gradient detection error:', err);
    return { x: Math.floor(gray.cols / 2), confidence: 0, method: 'gradient' };
  }
}

/**
 * Method 2: Density-based detection
 * adaptiveThreshold → morphologyEx CLOSE → connectedComponents → largest blob
 */
function detectByDensity(gray: any, p: ThresholdParams): MarginResult {
  try {
    const binary = track(new cv.Mat());
    const morph = track(new cv.Mat());
    const labels = track(new cv.Mat());
    const stats = track(new cv.Mat());
    const centroids = track(new cv.Mat());

    // Dynamic adaptive threshold
    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      p.adaptiveBlockSize,
      p.adaptiveC
    );

    // Morphological closing to connect nearby components
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 3));
    cv.morphologyEx(binary, morph, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // Connected components
    const numLabels = cv.connectedComponentsWithStats(morph, labels, stats, centroids);

    // Find blob closest to center X (excluding background label 0)
    let bestX = Math.floor(gray.cols / 2);
    let bestScore = -1;
    const centerX = gray.cols / 2;

    for (let i = 1; i < numLabels; i++) {
      const area = stats.intAt(i, cv.CC_STAT_AREA);
      const x = Math.floor(centroids.doubleAt(i, 0));
      
      // Calculate score based on area and distance to center
      // (Bigger area is good, closer to center is better)
      const distFromCenter = Math.abs(x - centerX);
      const distWeight = 1.0 - (distFromCenter / centerX); // 1.0 at center, 0.0 at edge
      const score = area * Math.pow(distWeight, 2); // Squared weight to strongly favor center

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
      }
    }

    const bindingX = bestX;

    // Content area for Density: encompass all major blobs
    let contentXStart = gray.cols * 0.1;
    let contentXEnd = gray.cols * 0.9;
    
    let minX = gray.cols, maxX = 0;
    for (let i = 1; i < numLabels; i++) {
        if (stats.intAt(i, cv.CC_STAT_AREA) > 50) {
            const x = stats.intAt(i, cv.CC_STAT_LEFT);
            const w = stats.intAt(i, cv.CC_STAT_WIDTH);
            if (x < minX) minX = x;
            if (x + w > maxX) maxX = x + w;
        }
    }
    if (maxX > minX) {
        contentXStart = minX;
        contentXEnd = maxX;
    }

    // Confidence based on density of largest component and balance
    const distWeight = 1.0 - (Math.abs(bindingX - ((contentXStart + contentXEnd) / 2)) / (gray.cols / 2));
    const confidence = Math.min(distWeight * 0.8 + (bestScore / (gray.rows * gray.cols * 0.05)), 1.0);

    return {
      x: bindingX,
      confidence,
      method: 'density',
      contentXStart,
      contentXEnd,
    };
  } catch (err) {
    console.error('[Worker] Density detection error:', err);
    return { x: Math.floor(gray.cols / 2), confidence: 0, method: 'density' };
  }
}

/**
 * Method 3: Edge-based detection
 * Canny → centre-third ROI → vertical morphological close → projectCols peak
 */
function detectByEdge(gray: any, p: ThresholdParams): MarginResult {
  try {
    const edges = track(new cv.Mat());
    const morph = track(new cv.Mat());

    // Canny edge detection with dynamic thresholds
    cv.Canny(gray, edges, p.cannyLow, p.cannyHigh);

    // Vertical morphological close to connect vertical edges
    // Python uses height // 30
    const kernelHeight = Math.max(15, Math.floor(gray.rows / 30));
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, kernelHeight));
    cv.morphologyEx(edges, morph, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    
    // Determine content box using edge projection
    const fullProj = projectCols(morph);
    const vAvg = fullProj.reduce((a, b) => a + b, 0) / fullProj.length;
    const vThresh = vAvg * 0.1;

    let contentXStart = 0;
    for (let i = 0; i < fullProj.length; i++) {
        if (fullProj[i] > vThresh) { contentXStart = i; break; }
    }
    let contentXEnd = fullProj.length - 1;
    for (let i = fullProj.length - 1; i >= 0; i--) {
        if (fullProj[i] > vThresh) { contentXEnd = i; break; }
    }

    const contentXWidth = contentXEnd - contentXStart;
    const bindingX = contentXStart + Math.floor(contentXWidth / 2);

    // Confidence based on peak height relative to average
    const peakVal = fullProj[bindingX] || 0;
    const confidence = Math.max(0.1, Math.min(peakVal / (vAvg * 5 + 1), 1.0));

    return {
      x: bindingX,
      confidence,
      method: 'edge',
      contentXStart,
      contentXEnd,
    };
  } catch (err) {
    console.error('[Worker] Edge detection error:', err);
    return { x: Math.floor(gray.cols / 2), confidence: 0, method: 'edge' };
  }
}

/**
 * Project columns (sum pixel values in each column)
 */
function projectCols(mat: any): number[] {
  const sum = track(new cv.Mat());
  cv.reduce(mat, sum, 0, cv.REDUCE_SUM, cv.CV_32S);
  // Convert 1xN result matrix to JS array
  return Array.from(sum.data32S);
}

/**
 * Compute confidence based on peak sharpness
 */
function computeConfidence(proj: number[], peakIdx: number): number {
  const peakVal = proj[peakIdx];
  const avgVal = proj.reduce((a, b) => a + b, 0) / proj.length;
  const ratio = peakVal / (avgVal + 1);
  return Math.min(ratio / 10, 1.0); // Normalize to 0-1
}

/**
 * Vote for best margin based on confidence
 */
function vote(results: MarginResult[]): MarginResult {
  return results.reduce((best, curr) => (curr.confidence > best.confidence ? curr : best));
}

