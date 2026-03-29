import { useCallback, useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const DPI = 300;
const PDF_DEFAULT_DPI = 72;
const SCALE = DPI / PDF_DEFAULT_DPI; // ~4.17x for 300 DPI

interface PdfDocument {
  doc: pdfjsLib.PDFDocumentProxy | null;
  pageCount: number;
}

/**
 * Hook for rendering PDF pages to ImageData at 300 DPI
 */
export function usePdfRenderer(pdfUrl: string) {
  const [pdfDoc, setPdfDoc] = useState<PdfDocument>({ doc: null, pageCount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PDF document
  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc({ doc: null, pageCount: 0 });
      return;
    }

    setIsLoading(true);
    setError(null);

    const loadingTask = pdfjsLib.getDocument(pdfUrl);

    loadingTask.promise
      .then((doc) => {
        setPdfDoc({ doc, pageCount: doc.numPages });
        setIsLoading(false);
        console.log(`[PdfRenderer] Loaded PDF: ${doc.numPages} pages`);
      })
      .catch((err) => {
        console.error('[PdfRenderer] Load error:', err);
        setError(err.message || 'Failed to load PDF');
        setIsLoading(false);
      });

    return () => {
      loadingTask.destroy();
    };
  }, [pdfUrl]);

  /**
   * Render a single page to ImageData at 300 DPI
   * Uses OffscreenCanvas for off-main-thread rendering
   */
  const renderPage = useCallback(async (pageNum: number): Promise<ImageData | null> => {
    if (!pdfDoc.doc || pageNum < 1 || pageNum > pdfDoc.pageCount) {
      console.error(`[PdfRenderer] Invalid page: ${pageNum}`);
      return null;
    }

    try {
      const page = await pdfDoc.doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: SCALE });

      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      console.log(
        `[PdfRenderer] Rendering page ${pageNum} at ${DPI} DPI: ${width}x${height}px`
      );

      // Use OffscreenCanvas if available (better performance)
      const canvas =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(width, height)
          : document.createElement('canvas');

      if (canvas instanceof HTMLCanvasElement) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext('2d', {
        alpha: false,
        willReadFrequently: true,
      });

      if (!context) {
        throw new Error('Failed to get canvas context');
      }

      // Render PDF page to canvas
      await page.render({
        canvasContext: context as any,
        viewport,
      } as any).promise;

      // Extract ImageData
      const imageData = context.getImageData(0, 0, width, height);

      console.log(
        `[PdfRenderer] Page ${pageNum} rendered: ${imageData.data.byteLength} bytes`
      );

      return imageData;
    } catch (err) {
      console.error(`[PdfRenderer] Render error (page ${pageNum}):`, err);
      return null;
    }
  }, [pdfDoc.doc, pdfDoc.pageCount]);

  /**
   * Render a lightweight thumbnail for gallery view
   */
  const renderThumbnail = useCallback(async (pageNum: number, scale = 0.3): Promise<string | null> => {
    if (!pdfDoc.doc || pageNum < 1 || pageNum > pdfDoc.pageCount) return null;

    try {
      const page = await pdfDoc.doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return null;

      await page.render({
        canvasContext: context as any,
        viewport,
      } as any).promise;

      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
      console.error(`[PdfRenderer] Thumbnail error (page ${pageNum}):`, err);
      return null;
    }
  }, [pdfDoc.doc, pdfDoc.pageCount]);

  return {
    pdfDoc: pdfDoc.doc,
    renderPage,
    renderThumbnail,
    pageCount: pdfDoc.pageCount,
    isLoading,
    error,
  };
}

/**
 * Standalone function to render a page (for use outside React)
 */
export async function renderPdfPage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageNum: number
): Promise<ImageData | null> {
  if (pageNum < 1 || pageNum > doc.numPages) {
    return null;
  }

  try {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });

    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas');

    if (canvas instanceof HTMLCanvasElement) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error('Failed to get canvas context');
    }

    await page.render({
      canvasContext: context as any,
      viewport,
    } as any).promise;

    return context.getImageData(0, 0, width, height);
  } catch (err) {
    console.error(`Render error (page ${pageNum}):`, err);
    return null;
  }
}
