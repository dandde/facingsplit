import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { WorkerInbound, WorkerOutbound } from '../types/pipeline';
import { useProcessingStore } from '../store/useProcessingStore';

interface WorkerContextValue {
  isReady: boolean;
  isInitializing: boolean;
  sendMessage: (msg: WorkerInbound) => void;
}

const WorkerContext = createContext<WorkerContextValue | null>(null);

export function WorkerProvider({ children }: { children: ReactNode }) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const { setPageResult, setPageError } = useProcessingStore();

  useEffect(() => {
    console.log('[WorkerCtx] Spawning processing worker...');
    
    // Spawn the worker as a 'classic' script to support importScripts
    const worker = new Worker(
      new URL('../workers/processingWorker.ts', import.meta.url),
      { type: 'classic' }
    );
    
    workerRef.current = worker;
    
    // Send initialization message with base URL for GitHub Pages compatibility
    const baseUrl = import.meta.env.BASE_URL || '/';
    const absoluteBase = new URL(baseUrl, window.location.href).href;
    worker.postMessage({ type: 'INIT', baseUrl: absoluteBase });

    // Set up message handler
    worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data;
      
      switch (msg.type) {
        case 'CV_INITIALIZING':
          console.log('[WorkerCtx] OpenCV.js initializing in worker...');
          setIsInitializing(true);
          break;

        case 'CV_READY':
          console.log('[WorkerCtx] OpenCV.js ready in worker');
          setIsInitializing(false);
          setIsReady(true);
          break;
          
        case 'PAGE_DONE': {
          const { pageNum, method, result } = msg;
          console.log(`[WorkerCtx] Page ${pageNum} done (${method})`);
          setPageResult(pageNum, method, result);
          break;
        }
        
        case 'PAGE_ERROR': {
          const { pageNum, method, error } = msg;
          console.error(`[WorkerCtx] Page ${pageNum} error (${method}):`, error);
          setPageError(pageNum, method, error);
          break;
        }
        
        default:
          console.warn('[WorkerCtx] Unknown message type:', msg);
      }
    };

    worker.onerror = (err: ErrorEvent) => {
      console.error('[WorkerCtx] Global Worker Error details:', {
        message: err.message,
        filename: err.filename,
        lineno: err.lineno,
        colno: err.colno,
        error: err.error
      });
    };

    // Cleanup on unmount
    return () => {
      console.log('[WorkerCtx] Terminating worker');
      worker.terminate();
    };
  }, [setPageResult, setPageError]);

  const sendMessage = (msg: WorkerInbound) => {
    if (!workerRef.current) {
      console.warn('[WorkerCtx] Worker not initialized');
      return;
    }
    
    // Transfer ImageData buffer instead of cloning (zero-copy)
    if (msg.type === 'PROCESS_PAGE') {
      workerRef.current.postMessage(msg, [msg.imageData.data.buffer]);
    } else {
      workerRef.current.postMessage(msg);
    }
  };

  return (
    <WorkerContext.Provider value={{ isReady, isInitializing, sendMessage }}>
      {children}
    </WorkerContext.Provider>
  );
}

export function useWorker() {
  const ctx = useContext(WorkerContext);
  if (!ctx) {
    throw new Error('useWorker must be used within WorkerProvider');
  }
  return ctx;
}
