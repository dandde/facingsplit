import React, { useEffect, useRef, useState } from 'react';
import { useOpenCv, OpenCvProvider } from './context/OpenCvProvider';
import { useWorker, WorkerProvider } from './context/WorkerCtx';
import { usePdfRenderer } from './services/pdfRenderer';
import { useProcessingStore } from './store/useProcessingStore';
import type { DetectMethod, ThresholdParams, ExportFormat } from './types/pipeline';
import { Sidebar } from './components/Sidebar';
import { PreviewCard } from './components/PreviewCard';
import { ThumbnailGallery } from './components/ThumbnailGallery';
import { useBatchProcessor } from './hooks/useBatchProcessor';
import { exportSplitPages } from './services/exportService';
import { BookIcon, ScissorsIcon } from './components/Icons';

function AppContent() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const { 
    viewMode, 
    setViewMode, 
    selectedPage,
    resetForNewDocument,
    theme,
    getResult,
    cache,
    isExporting,
    exportProgress,
    startExport,
    updateExportProgress,
    stopExport
  } = useProcessingStore();

  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [pdfName, setPdfName] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<DetectMethod>('gradient');
  const [thresholds, setThresholds] = useState<ThresholdParams>({
    claheClip: 2.0,
    binaryThresh: 30,
    adaptiveBlockSize: 11,
    adaptiveC: 2,
    cannyLow: 50,
    cannyHigh: 150,
  });
  
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [exportQuality, setExportQuality] = useState(0.85);
  const [isRenderingPage, setIsRenderingPage] = useState(false);

  const { isLoaded: cvLoaded } = useOpenCv();
  const { isReady: workerReady, sendMessage } = useWorker();
  
  const { 
    pdfDoc, 
    renderPage, 
    renderThumbnail, 
    pageCount, 
    isLoading: isPdfLoading 
  } = usePdfRenderer(pdfUrl);

  const { runBatch, cancelBatch, isBatchProcessing } = useBatchProcessor();

  // Load the current page into the hidden canvas whenever it changes and we're in 'split' mode
  useEffect(() => {
    if (!pdfUrl || !hiddenCanvasRef.current || viewMode !== 'split') return;

    let active = true;
    setIsRenderingPage(true);
    
    renderPage(selectedPage, 2.0).then(imageData => {
      if (!active || !imageData || !hiddenCanvasRef.current) return;
      
      const canvas = hiddenCanvasRef.current;
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(imageData, 0, 0);
      }
      setIsRenderingPage(false);
    });

    return () => { active = false; };
  }, [pdfUrl, selectedPage, viewMode, renderPage]);

  // Reset store when PDF changes
  useEffect(() => {
    if (pageCount > 0) {
      resetForNewDocument(pageCount);
    }
  }, [pageCount, resetForNewDocument]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      setPdfName(file.name);
    }
  };

  const handleLoadSample = async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const sampleUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}sample.pdf`;
      const response = await fetch(sampleUrl);
      if (!response.ok) throw new Error("Sample PDF not found");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfName('sample.pdf');
    } catch (err) {
      console.error("Failed to load sample:", err);
    }
  };

  const handleProcessPage = async () => {
    if (!pdfUrl || !workerReady || !hiddenCanvasRef.current) return;
    
    try {
      const canvas = hiddenCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      setViewMode('split');
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
    <div className="app-container" data-theme={theme}>
      <canvas ref={hiddenCanvasRef} style={{ display: 'none' }} />
      <Sidebar 
        cvLoaded={cvLoaded}
        workerReady={workerReady}
        pdfUrl={pdfUrl}
        pdfName={pdfName}
        pageCount={pageCount}
        selectedMethod={selectedMethod}
        setSelectedMethod={setSelectedMethod}
        handleProcessPage={handleProcessPage}
        isProcessing={isPdfLoading || isRenderingPage}
        isBatchProcessing={isBatchProcessing}
        isExporting={isExporting}
        processedCount={useProcessingStore.getState().processedPages}
        totalCount={pageCount}
        exportProgress={exportProgress}
        onFileSelect={handleFileSelect}
        onLoadSample={handleLoadSample}
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
        <header className="main-header">
          <div className="header-breadcrumbs">
             <span className="breadcrumb-path">FacingSplit</span>
             <span className="breadcrumb-separator">/</span>
             <span className="breadcrumb-current">
               {viewMode === 'gallery' ? 'Gallery' : `Analysis — Page ${selectedPage}`}
             </span>
          </div>

          {pdfUrl && (
            <div className="segmented-control mode-switch">
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
          )}
        </header>

        <section className="content-viewport">
          {!pdfUrl ? (
            <div className="empty-state">
              <div className="empty-artwork">
                <BookIcon className="artwork-icon" />
              </div>
              <h2 className="empty-title">Refined Page Splitting Studio</h2>
              <p className="empty-desc">
                Upload a scanned book PDF or load the sample to begin high-fidelity scanning.
              </p>
            </div>
          ) : viewMode === 'gallery' ? (
            <ThumbnailGallery 
              pageCount={pageCount}
              renderThumbnail={renderThumbnail}
            />
          ) : (
            <div className="split-view-container">
              {result ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: '100%' }}>
                  <PreviewCard 
                    title="Verso (Left)" 
                    badgeText="Clean" 
                    crop={result.leftCrop} 
                    margin={result.leftMargin} 
                    side="left"
                    pageNum={selectedPage}
                    sourceCanvas={hiddenCanvasRef.current}
                  />
                  <PreviewCard 
                    title="Recto (Right)" 
                    badgeText="Clean" 
                    crop={result.rightCrop} 
                    margin={result.rightMargin} 
                    side="right"
                    pageNum={selectedPage}
                    sourceCanvas={hiddenCanvasRef.current}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-artwork">
                    <ScissorsIcon className="artwork-icon" />
                  </div>
                  <h3 className="empty-title">Page Ready for Analysis</h3>
                  <p className="empty-desc">Click "PROCESS" in the sidebar to run the splitting algorithm.</p>
                  <button className="btn btn-secondary" onClick={() => setViewMode('gallery')}>
                    Back to Gallery
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <OpenCvProvider>
      <WorkerProvider>
        <AppContent />
      </WorkerProvider>
    </OpenCvProvider>
  );
}
