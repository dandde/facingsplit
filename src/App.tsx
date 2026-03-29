import { useEffect, useRef, useState } from 'react';
import { useOpenCv } from './context/OpenCvProvider';
import { useWorker } from './context/WorkerCtx';
import { usePdfRenderer } from './services/pdfRenderer';
import { useProcessingStore } from './store/useProcessingStore';
import type { DetectMethod, ThresholdParams } from './types/pipeline';
import { Sidebar } from './components/Sidebar';
import { PreviewCard } from './components/PreviewCard';
import { ConfidenceBar } from './components/ConfidenceBar';
import { ThumbnailGallery } from './components/ThumbnailGallery';
import { useBatchProcessor } from './hooks/useBatchProcessor';
import { exportSplitPages, ExportFormat } from './services/exportService';
import { BookIcon, ScissorsIcon } from './components/Icons';

function AppContent() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfName, setPdfName] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState(1);
  const [selectedMethod, setSelectedMethod] = useState<DetectMethod>('gradient');
  const [isPageRendering, setIsPageRendering] = useState(false);
  const [viewMode, setViewMode] = useState<'gallery' | 'split'>('gallery');
  const lastRenderedRef = useRef<string>('');
  const [thresholds, setThresholds] = useState<ThresholdParams>({
    claheClip: 2.0,
    binaryThresh: 30,
    adaptiveBlockSize: 11,
    adaptiveC: 2,
    cannyLow: 50,
    cannyHigh: 150,
  });
  
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [exportQuality, setExportQuality] = useState(0.8);
  
  const { isLoaded: cvLoaded } = useOpenCv();
  const { isReady: workerReady, sendMessage } = useWorker();
  const { pdfDoc, renderPage, renderThumbnail, pageCount, isLoading: isPdfLoading } = usePdfRenderer(pdfUrl);
  const { runBatch, cancelBatch, isBatchProcessing } = useBatchProcessor();
  
  const { 
    getResult, 
    processedPages, 
    totalPages,
    cache,
    isExporting,
    exportProgress,
    startExport,
    updateExportProgress,
    stopExport,
    theme
  } = useProcessingStore();

  useEffect(() => {
    if (pdfUrl) {
      setViewMode('gallery');
    }
  }, [pdfUrl]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    let isSubscribed = true;
    
    async function updateHiddenCanvas() {
      if (!pdfUrl || pageCount === 0 || isBatchProcessing || isExporting) return;
      
      const renderKey = `${pdfUrl}-${selectedPage}`;
      if (lastRenderedRef.current === renderKey) return;
      
      setIsPageRendering(true);
      try {
        const imageData = await renderPage(selectedPage);
        if (!isSubscribed || !imageData || !hiddenCanvasRef.current) return;
        
        lastRenderedRef.current = renderKey;
        const canvas = hiddenCanvasRef.current;
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(imageData, 0, 0);
        }
      } catch (err) {
        console.error('Failed to update hidden canvas:', err);
      } finally {
        if (isSubscribed) {
          setIsPageRendering(false);
        }
      }
    }
    
    updateHiddenCanvas();
    return () => { isSubscribed = false; };
  }, [pdfUrl, selectedPage, pageCount, renderPage, isBatchProcessing, isExporting]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setPdfName(file.name);
    const url = URL.createObjectURL(file);
    setPdfUrl(url);
    setSelectedPage(1);
  };

  const handleProcessPage = async () => {
    if (!pdfUrl || !workerReady) return;
    setViewMode('split');
    
    try {
      const canvas = hiddenCanvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      sendMessage({
        type: 'PROCESS_PAGE',
        pageNum: selectedPage,
        method: selectedMethod,
        imageData,
        params: thresholds,
      });
    } catch (err) {
      console.error('Error processing page:', err);
    }
  };

  const handleProcessAll = () => {
    setViewMode('split');
    runBatch({
      pdfUrl,
      renderPage,
      pageCount,
      method: selectedMethod,
      thresholds
    });
  };

  const handleExportResult = async () => {
    if (!pdfDoc) return;
    
    startExport(pageCount);
    try {
      await exportSplitPages({
        pdfDoc,
        fileName: pdfName,
        results: cache,
        format: exportFormat,
        quality: exportQuality,
        onProgress: (page) => {
          updateExportProgress(page);
        }
      });
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      stopExport();
    }
  };

  const result = getResult(selectedPage, selectedMethod);

  return (
    <div className="app-container">
      <Sidebar 
        cvLoaded={cvLoaded}
        workerReady={workerReady}
        pdfUrl={pdfUrl}
        pdfName={pdfName}
        pageCount={pageCount}
        selectedPage={selectedPage}
        setSelectedPage={setSelectedPage}
        selectedMethod={selectedMethod}
        setSelectedMethod={setSelectedMethod}
        handleProcessPage={handleProcessPage}
        isProcessing={isPdfLoading || isPageRendering}
        isBatchProcessing={isBatchProcessing}
        isExporting={isExporting}
        processedCount={processedPages}
        totalCount={totalPages}
        exportProgress={exportProgress}
        onFileSelect={handleFileSelect}
        fileInputRef={fileInputRef}
        thresholds={thresholds}
        setThresholds={setThresholds}
        handleProcessAll={handleProcessAll}
        handleCancelBatch={cancelBatch}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        exportQuality={exportQuality}
        setExportQuality={setExportQuality}
        handleExport={handleExportResult}
      />
      
      <main className="main-content">
        <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />

        {!pdfUrl ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
               <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px', opacity: 0.8 }}>
                 <BookIcon />
               </div>
               <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '1.5rem' }}>FacingSplit Studio</h2>
               <p style={{ maxWidth: '320px', fontSize: '0.95rem', lineHeight: '1.5' }}>Upload a scanned book PDF to begin high-accuracy page splitting.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="sidebar-header" style={{ background: 'transparent', padding: '0 0 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                 {viewMode === 'gallery' ? 'Gallery' : `Analysis — ${selectedPage}`}
               </h2>
               <div className="segmented-control" style={{ maxWidth: '160px' }}>
                  <button 
                    className={`segmented-item ${viewMode === 'gallery' ? 'active' : ''}`}
                    onClick={() => setViewMode('gallery')}
                  >
                    Gallery
                  </button>
                  <button 
                    className={`segmented-item ${viewMode === 'split' ? 'active' : ''}`}
                    onClick={() => setViewMode('split')}
                  >
                    Split
                  </button>
               </div>
            </div>

            {viewMode === 'gallery' ? (
              <ThumbnailGallery 
                pageCount={pageCount}
                renderThumbnail={renderThumbnail}
                onSelectPage={(page) => {
                  setSelectedPage(page);
                  setViewMode('split');
                }}
                selectedPage={selectedPage}
              />
            ) : result ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <PreviewCard 
                    title="Verso (Left)" 
                    badgeText="Clean" 
                    crop={result.leftCrop} 
                    margin={result.leftMargin} 
                    sourceCanvas={hiddenCanvasRef.current}
                    side="left"
                  />
                  <PreviewCard 
                    title="Recto (Right)" 
                    badgeText="Clean" 
                    crop={result.rightCrop} 
                    margin={result.rightMargin} 
                    sourceCanvas={hiddenCanvasRef.current}
                    side="right"
                  />
                </div>

                <div className="confidence-panel" style={{ marginTop: '20px' }}>
                  <span className="section-label">Pipeline Confidence</span>
                  <ConfidenceBar label="Gradient" value={result.leftMargin.confidence} />
                  <ConfidenceBar label="Edge Bound" value={result.rightMargin.confidence} />
                </div>
              </>
            ) : (
              <div className="page-result-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                   <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', opacity: 0.6 }}>
                     <ScissorsIcon />
                   </div>
                   <div style={{ fontSize: '0.9rem', marginBottom: '16px' }}>Click "PROCESS" in the sidebar to run the splitting algorithm.</div>
                   <button 
                     className="btn btn-secondary" 
                     onClick={() => setViewMode('gallery')}
                   >
                     BACK TO GALLERY
                   </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

import { OpenCvProvider } from './context/OpenCvProvider';
import { WorkerProvider } from './context/WorkerCtx';

export default function App() {
  return (
    <OpenCvProvider>
      <WorkerProvider>
        <AppContent />
      </WorkerProvider>
    </OpenCvProvider>
  );
}
