import { ThresholdParams, DetectMethod, ExportFormat } from '../types/pipeline';
import { ThresholdControls } from './ThresholdControls';
import { useProcessingStore } from '../store/useProcessingStore';
import { SunIcon, MoonIcon, FolderIcon } from './Icons';

interface SidebarProps {
  cvLoaded: boolean;
  workerReady: boolean;
  pdfUrl: string;
  pdfName: string;
  pageCount: number;
  selectedPage: number;
  setSelectedPage: (page: number) => void;
  selectedMethod: DetectMethod;
  setSelectedMethod: (method: DetectMethod) => void;
  handleProcessPage: () => void;
  isProcessing: boolean;
  isBatchProcessing: boolean;
  isExporting: boolean;
  processedCount: number;
  totalCount: number;
  exportProgress: number;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  thresholds: ThresholdParams;
  setThresholds: (t: ThresholdParams) => void;
  handleProcessAll: () => void;
  handleCancelBatch: () => void;
  exportFormat: ExportFormat;
  setExportFormat: (f: ExportFormat) => void;
  exportQuality: number;
  setExportQuality: (q: number) => void;
  handleExport: () => void;
}

export function Sidebar({
  cvLoaded,
  workerReady,
  pdfUrl,
  pdfName,
  pageCount,
  selectedPage,
  setSelectedPage,
  selectedMethod,
  setSelectedMethod,
  handleProcessPage,
  isProcessing,
  isBatchProcessing,
  isExporting,
  processedCount,
  totalCount,
  exportProgress,
  onFileSelect,
  fileInputRef,
  thresholds,
  setThresholds,
  handleProcessAll,
  handleCancelBatch,
  exportFormat,
  setExportFormat,
  exportQuality,
  setExportQuality,
  handleExport
}: SidebarProps) {
  const { theme, toggleTheme } = useProcessingStore();
  
  const methods: { id: DetectMethod; name: string; desc: string }[] = [
    { id: 'gradient', name: 'Gradient Peak', desc: 'Symmetry via Sobel gradients. Fast & precise.' },
    { id: 'density', name: 'Pixel Density', desc: 'Adaptive thresholding for text-heavy scans.' },
    { id: 'edge', name: 'Vertical Edges', desc: 'Binding line detection using Canny edges.' }
  ];

  const progressPercent = isExporting 
    ? (pageCount > 0 ? (exportProgress / pageCount) * 100 : 0)
    : (totalCount > 0 ? (processedCount / totalCount) * 100 : 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-header" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
           <div>
             <h1 className="sidebar-title">FacingSplit</h1>
             <span className="sidebar-subtitle">Wasm Scanned Splitter v0.2</span>
           </div>
           <button 
             className="btn-secondary" 
             onClick={toggleTheme}
             style={{ 
               padding: '0', 
               minWidth: '36px', 
               height: '36px', 
               display: 'flex', 
               alignItems: 'center', 
               justifyContent: 'center', 
               borderRadius: '10px',
               background: theme === 'dark' ? 'rgba(222, 216, 206, 0.08)' : 'rgba(42, 26, 16, 0.08)',
               border: `1.5px solid ${theme === 'dark' ? 'rgba(222, 216, 206, 0.2)' : 'rgba(42, 26, 16, 0.2)'}`,
               color: 'var(--accent-primary)',
               boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
             }}
             title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
           >
             {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
           </button>
        </div>
      </div>

      <div className="sidebar-scrollable">
        <div className="sidebar-section">
          <span className="section-label">Source</span>
          {!pdfUrl ? (
            <div className="dropzone" onClick={() => fileInputRef.current?.click()}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--text-muted)' }}>
                <FolderIcon />
              </div>
              <div className="method-name" style={{ fontSize: '0.8rem' }}>Click to Browse</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={onFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <div className="file-chip">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="file-name">{pdfName}</div>
                <div className="file-info">{pageCount} Pages</div>
              </div>
              <button 
                className="btn-secondary" 
                style={{ padding: '4px 8px', fontSize: '10px' }}
                disabled={isBatchProcessing || isExporting}
                onClick={() => fileInputRef.current?.click()}
              >
                Edit
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={onFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <span className="section-label">Pipeline Status</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className={`badge ${cvLoaded ? 'badge-success' : ''}`} style={{ background: cvLoaded ? 'rgba(149, 163, 145, 0.2)' : 'rgba(0,0,0,0.2)', color: cvLoaded ? 'var(--accent-success)' : 'var(--text-muted)' }}>
              OpenCV {cvLoaded ? 'Ready' : '...'}
            </div>
            <div className={`badge ${workerReady ? 'badge-success' : ''}`} style={{ background: workerReady ? 'rgba(149, 163, 145, 0.2)' : 'rgba(0,0,0,0.2)', color: workerReady ? 'var(--accent-success)' : 'var(--text-muted)' }}>
              Worker {workerReady ? 'Active' : '...'}
            </div>
          </div>
        </div>

        {pdfUrl && (
          <>
            <div className="sidebar-section">
              <span className="section-label">Navigation</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <button 
                   className="btn-secondary" 
                   style={{ flex: 1 }}
                   disabled={isBatchProcessing || isExporting}
                   onClick={() => setSelectedPage(Math.max(1, selectedPage - 1))}
                 >
                   Prev
                 </button>
                 <div className="stat-value" style={{ width: '40px', textAlign: 'center', fontSize: '1rem' }}>{selectedPage}</div>
                 <button 
                   className="btn-secondary" 
                   style={{ flex: 1 }}
                   disabled={isBatchProcessing || isExporting}
                   onClick={() => setSelectedPage(Math.min(pageCount, selectedPage + 1))}
                 >
                   Next
                 </button>
              </div>
            </div>

            <div className="sidebar-section">
              <span className="section-label">Detection Method</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {methods.map((m) => (
                  <div 
                    key={m.id} 
                    className={`method-card ${selectedMethod === m.id ? 'active' : ''} ${isBatchProcessing || isExporting ? 'disabled' : ''}`}
                    onClick={() => !isBatchProcessing && !isExporting && setSelectedMethod(m.id)}
                  >
                    <span className="method-name">{m.name}</span>
                    <span className="method-desc">{m.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <ThresholdControls thresholds={thresholds} setThresholds={setThresholds} />

            <div className="sidebar-section">
              <span className="section-label">Export Configuration</span>
              <div className="control-group">
                <div className="control-header">
                  <label>Output Format</label>
                </div>
                <div className="segmented-control">
                  <button 
                    className={`segmented-item ${exportFormat === 'pdf' ? 'active' : ''}`}
                    onClick={() => setExportFormat('pdf')}
                    disabled={isExporting}
                  >
                    PDF
                  </button>
                  <button 
                    className={`segmented-item ${exportFormat === 'zip' ? 'active' : ''}`}
                    onClick={() => setExportFormat('zip')}
                    disabled={isExporting}
                  >
                    ZIP (JPG)
                  </button>
                </div>
              </div>
              <div className="control-group">
                <div className="control-header">
                  <label>JPEG Quality</label>
                  <span className="control-val">{Math.round(exportQuality * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="1" step="0.05" 
                  value={exportQuality} 
                  onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                  disabled={isExporting}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        {pdfUrl && (
          <div className="sidebar-section" style={{ borderTop: 'none', padding: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="section-label" style={{ marginBottom: 0 }}>{isExporting ? 'Exporting' : 'Progress'}</span>
              {(isBatchProcessing || isExporting) && (
                 <span className="badge badge-success" style={{ animation: 'pulse 1.5s infinite' }}>
                   {isExporting ? 'Compressing' : 'Processing Batch'}
                 </span>
              )}
            </div>
            
            <div className="progress-track" style={{ height: '4px', marginBottom: '12px' }}>
               <div className="progress-fill" style={{ width: `${progressPercent}%`, backgroundColor: isExporting ? 'var(--accent-success)' : 'var(--accent-primary)' }} />
            </div>

            <div className="stats-grid" style={{ marginBottom: '16px' }}>
               <div className="stat-card">
                  <div className="stat-value">{isExporting ? exportProgress : processedCount}</div>
                  <div className="stat-key">{isExporting ? 'Exported' : 'Processed'}</div>
               </div>
               <div className="stat-card">
                  <div className="stat-value">{isExporting ? pageCount : totalCount}</div>
                  <div className="stat-key">Total</div>
               </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isBatchProcessing ? (
                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                  onClick={handleCancelBatch}
                >
                  CANCEL BATCH
                </button>
              ) : isExporting ? (
                 <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', background: 'var(--accent-muted)' }}
                  disabled
                >
                  GENERATING FILE...
                </button>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleProcessPage}
                      disabled={isProcessing || !workerReady}
                    >
                      {isProcessing ? 'SCANNING...' : 'PROCESS'}
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      onClick={handleProcessAll}
                      disabled={isProcessing || !workerReady}
                    >
                      BATCH
                    </button>
                  </div>
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', background: 'var(--accent-success)' }}
                    onClick={handleExport}
                    disabled={isProcessing || !workerReady || processedCount === 0}
                  >
                    DOWNLOAD RESULT
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        
        {!pdfUrl && (
           <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
             Select a PDF to begin splitting facing pages into single pages.
           </div>
        )}
      </div>
    </aside>
  );
}
