// Detection method types
export type DetectMethod = 'gradient' | 'density' | 'edge';
export type ExportFormat = 'pdf' | 'zip';

// Margin detection result
export interface MarginResult {
  x: number;               // X-coordinate of detected split point
  confidence: number;      // 0-1 confidence score
  method: DetectMethod;
  contentXStart?: number;  // Detected start of content area
  contentXEnd?: number;    // Detected end of content area
}

// Rectangle for crop boxes
export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Final split result containing both margins and crop boxes
export interface SplitResult {
  leftMargin: MarginResult;
  rightMargin: MarginResult;
  leftCrop: CropBox;
  rightCrop: CropBox;
}

// Thresholding parameters for tuning the detection algorithms
export interface ThresholdParams {
  // General Enhancement
  claheClip: number;        // CLAHE clip limit (default: 2.0)
  
  // Gradient Method
  binaryThresh: number;     // Binary threshold for Sobel gradient (default: 30)
  
  // Density Method
  adaptiveBlockSize: number; // Adaptive threshold block size (default: 11)
  adaptiveC: number;         // Adaptive threshold constant C (default: 2)
  
  // Edge Method
  cannyLow: number;         // Canny low threshold (default: 50)
  cannyHigh: number;        // Canny high threshold (default: 150)
}

// Messages sent TO the worker (inbound)
export type WorkerInbound = 
  | { type: 'INIT'; baseUrl: string }
  | {
      type: 'PROCESS_PAGE';
      pageNum: number;
      method: DetectMethod;
      imageData: ImageData;
      params?: ThresholdParams; // Optional parametric tuning
    };

// Messages sent FROM the worker (outbound)
export type WorkerOutbound =
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
