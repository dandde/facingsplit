import { useCallback, useRef } from 'react';
import { useProcessingStore } from '../store/useProcessingStore';
import { useWorker } from '../context/WorkerCtx';
import { DetectMethod, ThresholdParams } from '../types/pipeline';

interface BatchOptions {
  pdfUrl: string;
  renderPage: (pageNum: number) => Promise<ImageData | null>;
  pageCount: number;
  method: DetectMethod;
  thresholds: ThresholdParams;
}

export function useBatchProcessor() {
  const { 
    startBatch, 
    stopBatch, 
    isBatchProcessing,
    cache 
  } = useProcessingStore();
  
  const { sendMessage, isReady: workerReady } = useWorker();
  const stopRef = useRef(false);

  const runBatch = useCallback(async ({
    pdfUrl,
    renderPage,
    pageCount,
    method,
    thresholds
  }: BatchOptions) => {
    if (!pdfUrl || !workerReady || isBatchProcessing) return;

    stopRef.current = false;
    startBatch(pageCount);

    try {
      for (let i = 1; i <= pageCount; i++) {
        if (stopRef.current) break;

        // Skip if already in cache with same method
        const cacheKey = `${i}:${method}`;
        if (cache[cacheKey]?.result) {
          console.log(`[Batch] Page ${i} already in cache, skipping`);
          continue;
        }

        console.log(`[Batch] Rendering page ${i}/${pageCount}`);
        const imageData = await renderPage(i);
        
        if (!imageData) {
          console.error(`[Batch] Failed to render page ${i}`);
          continue;
        }

        if (stopRef.current) break;

        // Process page
        sendMessage({
          type: 'PROCESS_PAGE',
          pageNum: i,
          method,
          imageData,
          params: thresholds,
        });

        // Wait for page to be done (simple poll for now, or we could use an event emitter)
        // Since the store updates setPageResult, we can check the cache
        await new Promise<void>((resolve) => {
          const check = () => {
            if (stopRef.current) {
              resolve();
              return;
            }
            if (useProcessingStore.getState().cache[`${i}:${method}`]) {
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
      }
    } catch (err) {
      console.error('[Batch] Error during batch processing:', err);
    } finally {
      stopBatch();
    }
  }, [workerReady, isBatchProcessing, startBatch, stopBatch, cache, sendMessage]);

  const cancelBatch = useCallback(() => {
    stopRef.current = true;
    stopBatch();
  }, [stopBatch]);

  return {
    runBatch,
    cancelBatch,
    isBatchProcessing
  };
}
