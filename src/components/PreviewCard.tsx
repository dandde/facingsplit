import { useRef, useEffect } from 'react';
import type { MarginResult, CropBox } from '../types/pipeline';

interface PreviewCardProps {
  title: string;
  badgeText: string;
  crop: CropBox;
  margin: MarginResult;
  side: 'left' | 'right';
  pageNum: number;
  sourceCanvas?: HTMLCanvasElement | null;
}

export function PreviewCard({ 
  title, 
  badgeText, 
  crop, 
  margin, 
  sourceCanvas,
  pageNum 
}: PreviewCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!sourceCanvas || !canvasRef.current || !crop) return;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    canvasRef.current.width = crop.width;
    canvasRef.current.height = crop.height;
    
    ctx.drawImage(
      sourceCanvas,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, crop.width, crop.height
    );
  }, [sourceCanvas, crop, pageNum]);

  return (
    <div className="page-result-card">
      <div className="page-card-header">
        <span className="page-title">{title}</span>
        <span className="badge badge-success">{badgeText}</span>
      </div>
      <div className="preview-container">
        {sourceCanvas ? (
          <canvas 
            ref={canvasRef} 
            style={{ 
              display: 'block', 
              maxWidth: '100%', 
              maxHeight: '60vh', 
              objectFit: 'contain', 
              background: '#fff', 
              boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
              borderRadius: '4px'
            }} 
          />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            Source image unavailable for preview
          </div>
        )}
      </div>
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Confidence: {Math.round(margin.confidence * 100)}%</span>
        <span>Split: {crop.width}x{crop.height}</span>
      </div>
    </div>
  );
}
