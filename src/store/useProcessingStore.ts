import { create } from 'zustand';
import type { DetectMethod, SplitResult } from '../types/pipeline';

interface PageQueueItem {
  pageNum: number;
  method: DetectMethod;
  imageData: ImageData;
  status: 'pending' | 'processing' | 'done' | 'error';
}

interface PageResultCache {
  // Key format: `${pageNum}:${method}`
  [key: string]: {
    result?: SplitResult;
    error?: string;
    timestamp: number;
  };
}

export type ViewMode = 'gallery' | 'split';

interface ProcessingState {
  // Navigation & View
  viewMode: ViewMode;
  selectedPage: number;
  
  // Queue management
  queue: PageQueueItem[];
  isProcessing: boolean;
  isBatchProcessing: boolean;
  isExporting: boolean;
  exportProgress: number;
  
  // Result cache
  cache: PageResultCache;
  
  // Progress stats
  totalPages: number;
  processedPages: number;
  errorPages: number;
  
  // Theme management
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
  
  // Actions
  setViewMode: (mode: ViewMode) => void;
  setSelectedPage: (page: number) => void;
  selectPage: (page: number) => void; // Sets page and switches to split view
  enqueuePage: (pageNum: number, method: DetectMethod, imageData: ImageData) => void;
  setPageResult: (pageNum: number, method: DetectMethod, result: SplitResult) => void;
  setPageError: (pageNum: number, method: DetectMethod, error: string) => void;
  getResult: (pageNum: number, method: DetectMethod) => SplitResult | undefined;
  
  // Batch processing
  startBatch: (total: number) => void;
  updateBatchProgress: (processed: number, errors: number) => void;
  stopBatch: () => void;
  
  // Exporting
  startExport: (total: number) => void;
  updateExportProgress: (page: number) => void;
  stopExport: () => void;
  
  clearQueue: () => void;
  reset: () => void;
  resetForNewDocument: (total: number) => void;
}

const getInitialTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('facingsplit-theme') as 'dark' | 'light';
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
};

const initialState = {
  viewMode: 'gallery' as const,
  selectedPage: 1,
  queue: [],
  isProcessing: false,
  isBatchProcessing: false,
  isExporting: false,
  exportProgress: 0,
  cache: {},
  totalPages: 0,
  processedPages: 0,
  errorPages: 0,
  theme: getInitialTheme(),
};

export const useProcessingStore = create<ProcessingState>((set, get) => ({
  ...initialState,

  setViewMode: (viewMode) => set({ viewMode }),
  
  setSelectedPage: (selectedPage) => set({ selectedPage }),

  selectPage: (selectedPage) => set({ selectedPage, viewMode: 'split' }),

  setTheme: (theme) => {
    localStorage.setItem('facingsplit-theme', theme);
    set({ theme });
  },

  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('facingsplit-theme', nextTheme);
    set({ theme: nextTheme });
  },

  enqueuePage: (pageNum, method, imageData) => {
    const cacheKey = `${pageNum}:${method}`;
    
    // Check if already cached
    if (get().cache[cacheKey]) {
      console.log(`[Store] Page ${pageNum} (${method}) already cached, skipping`);
      return;
    }
    
    set((state) => {
      // Check if already in queue
      const exists = state.queue.some(
        (item) => item.pageNum === pageNum && item.method === method
      );
      
      if (exists) {
        console.log(`[Store] Page ${pageNum} (${method}) already queued`);
        return state;
      }
      
      return {
        queue: [
          ...state.queue,
          {
            pageNum,
            method,
            imageData,
            status: 'pending' as const,
          },
        ],
        totalPages: Math.max(state.totalPages, pageNum),
      };
    });
  },

  setPageResult: (pageNum, method, result) => {
    const cacheKey = `${pageNum}:${method}`;
    
    set((state) => ({
      cache: {
        ...state.cache,
        [cacheKey]: {
          result,
          timestamp: Date.now(),
        },
      },
      queue: state.queue.map((item) =>
        item.pageNum === pageNum && item.method === method
          ? { ...item, status: 'done' as const }
          : item
      ),
      processedPages: state.processedPages + 1,
    }));
  },

  setPageError: (pageNum, method, error) => {
    const cacheKey = `${pageNum}:${method}`;
    
    set((state) => ({
      cache: {
        ...state.cache,
        [cacheKey]: {
          error,
          timestamp: Date.now(),
        },
      },
      queue: state.queue.map((item) =>
        item.pageNum === pageNum && item.method === method
          ? { ...item, status: 'error' as const }
          : item
      ),
      errorPages: state.errorPages + 1,
    }));
  },

  getResult: (pageNum, method) => {
    const cacheKey = `${pageNum}:${method}`;
    return get().cache[cacheKey]?.result;
  },

  startBatch: (total) => {
    set({ 
      isBatchProcessing: true, 
      totalPages: total,
      processedPages: 0,
      errorPages: 0
    });
  },

  updateBatchProgress: (processed, errors) => {
    set({
      processedPages: processed,
      errorPages: errors
    });
  },

  stopBatch: () => {
    set({ isBatchProcessing: false });
  },

  startExport: (total) => {
    set({ isExporting: true, exportProgress: 0, totalPages: total });
  },

  updateExportProgress: (page) => {
    set({ exportProgress: page });
  },

  stopExport: () => {
    set({ isExporting: false });
  },

  clearQueue: () => {
    set({ queue: [] });
  },

  reset: () => {
    set(initialState);
  },

  resetForNewDocument: (total) => {
    set({
      ...initialState,
      totalPages: total,
      cache: {},
      queue: [],
      processedPages: 0,
      errorPages: 0,
      viewMode: 'gallery',
      selectedPage: 1
    });
  },
}));
