import { ThumbnailItem } from './ThumbnailItem';

interface ThumbnailGalleryProps {
  pageCount: number;
  renderThumbnail: (pageNum: number) => Promise<string | null>;
  onSelectPage: (pageNum: number) => void;
  selectedPage: number;
}

export function ThumbnailGallery({ pageCount, renderThumbnail, onSelectPage, selectedPage }: ThumbnailGalleryProps) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="thumbnail-gallery-container">
      <div className="gallery-header">
        <h2 className="gallery-title">Document Gallery</h2>
        <span className="gallery-subtitle">{pageCount} total pages available</span>
      </div>
      <div className="thumbnail-grid">
        {pages.map((pageNum) => (
          <ThumbnailItem 
            key={pageNum}
            pageNum={pageNum}
            renderThumbnail={renderThumbnail}
            onClick={onSelectPage}
            isSelected={selectedPage === pageNum}
          />
        ))}
      </div>
    </div>
  );
}
