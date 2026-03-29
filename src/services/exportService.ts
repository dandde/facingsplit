import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { SplitResult } from '../types/pipeline';
import { renderPdfPage } from './pdfRenderer';

export type ExportFormat = 'pdf' | 'zip';

interface ExportOptions {
  pdfDoc: PDFDocumentProxy;
  fileName: string;
  results: Record<string, { result?: SplitResult }>;
  format: ExportFormat;
  quality: number; // 0 to 1
  onProgress: (page: number, total: number) => void;
}

export async function exportSplitPages({
  pdfDoc,
  fileName,
  results,
  format,
  quality,
  onProgress
}: ExportOptions) {
  const totalPages = pdfDoc.numPages;
  const pdfNameBase = fileName.replace(/\.[^/.]+$/, "");

  if (format === 'zip') {
    const zip = new JSZip();
    
    for (let i = 1; i <= totalPages; i++) {
      onProgress(i, totalPages);
      
      const pageResult = results[`${i}:gradient`]?.result || 
                         results[`${i}:density`]?.result || 
                         results[`${i}:edge`]?.result;
      
      if (!pageResult) continue;

      const imageData = await renderPdfPage(pdfDoc, i);
      if (!imageData) continue;

      // Extract left and right images as Blobs
      const [leftBlob, rightBlob] = await Promise.all([
        cropToBlob(imageData, pageResult.leftCrop, quality),
        cropToBlob(imageData, pageResult.rightCrop, quality)
      ]);

      const pageNumStr = i.toString().padStart(3, '0');
      zip.file(`${pdfNameBase}_page${pageNumStr}_L.jpg`, leftBlob);
      zip.file(`${pdfNameBase}_page${pageNumStr}_R.jpg`, rightBlob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${pdfNameBase}_split.zip`);
    
  } else {
    // PDF Export
    const outPdf = await PDFDocument.create();
    
    for (let i = 1; i <= totalPages; i++) {
      onProgress(i, totalPages);
      
      const pageResult = results[`${i}:gradient`]?.result || 
                         results[`${i}:density`]?.result || 
                         results[`${i}:edge`]?.result;
      
      if (!pageResult) continue;

      const imageData = await renderPdfPage(pdfDoc, i);
      if (!imageData) continue;

      // Extract left and right images as compressed JPEGs
      const [leftData, rightData] = await Promise.all([
        cropToJpegArray(imageData, pageResult.leftCrop, quality),
        cropToJpegArray(imageData, pageResult.rightCrop, quality)
      ]);

      // Embed into PDF
      const [leftImg, rightImg] = await Promise.all([
        outPdf.embedJpg(leftData),
        outPdf.embedJpg(rightData)
      ]);

      // Add pages for both
      const p1 = outPdf.addPage([leftImg.width, leftImg.height]);
      p1.drawImage(leftImg, { x: 0, y: 0, width: leftImg.width, height: leftImg.height });
      
      const p2 = outPdf.addPage([rightImg.width, rightImg.height]);
      p2.drawImage(rightImg, { x: 0, y: 0, width: rightImg.width, height: rightImg.height });
    }

    const pdfBytes = await outPdf.save();
    saveAs(new Blob([pdfBytes as any], { type: 'application/pdf' }), `${pdfNameBase}_split.pdf`);
  }
}

/**
 * Utility to crop ImageData and return a JPEG Blob with specified quality
 */
async function cropToBlob(
  source: ImageData, 
  crop: { x: number; y: number; width: number; height: number },
  quality: number
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context failed');

  // Draw the cropped portion
  ctx.putImageData(source, -crop.x, -crop.y);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', quality);
  });
}

/**
 * Utility to crop ImageData and return a JPEG Uint8Array for PDF embedding
 */
async function cropToJpegArray(
  source: ImageData,
  crop: { x: number; y: number; width: number; height: number },
  quality: number
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context failed');

  ctx.putImageData(source, -crop.x, -crop.y);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1];
  const binStr = atob(base64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}
