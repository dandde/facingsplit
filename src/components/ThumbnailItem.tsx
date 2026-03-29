import { useEffect, useRef, useState } from 'react';

interface ThumbnailItemProps {
  pageNum: number;
  renderThumbnail: (pageNum: number) => Promise<string | null>;
  onClick: (pageNum: number) => void;
  isSelected: boolean;
}

export function ThumbnailItem({ pageNum, renderThumbnail, onClick, isSelected }: ThumbnailItemProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsIntersecting(true);
        observerRef.current?.disconnect();
      }
    }, { threshold: 0.1 });

    observerRef.current.observe(containerRef.current);
    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    if (isIntersecting && !imgSrc) {
      renderThumbnail(pageNum).then((src) => {
        if (active && src) setImgSrc(src);
      });
    }
    return () => { active = false; };
  }, [isIntersecting, pageNum, renderThumbnail, imgSrc]);

  return (
    <div 
      ref={containerRef}
      className={`thumbnail-item ${isSelected ? 'active' : ''}`}
      onClick={() => onClick(pageNum)}
    >
      <div className="thumbnail-paper">
        {imgSrc ? (
          <img src={imgSrc} alt={`Page ${pageNum}`} loading="lazy" />
        ) : (
          <div className="thumbnail-placeholder">
            <span>{pageNum}</span>
          </div>
        )}
      </div>
      <div className="thumbnail-label">Page {pageNum}</div>
    </div>
  );
}
