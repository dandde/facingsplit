import fitz  # PyMuPDF
import cv2
import numpy as np
import os
from PIL import Image
import logging
from pathlib import Path
from typing import List, Tuple, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def extract_images_from_pdf(pdf_path: str) -> List[Image.Image]:
    """
    Extract images from PDF pages using PyMuPDF, which provides better performance
    and memory efficiency compared to pdf2image.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        List of PIL Image objects, one for each page
        
    Raises:
        FileNotFoundError: If PDF file doesn't exist
        ValueError: If PDF is empty or corrupted
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
    images = []
    try:
        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            raise ValueError("PDF file appears to be empty")
            
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Increase resolution for better quality (300 DPI)
            zoom = 300 / 72  # Convert DPI to zoom factor
            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix)
            
            # Convert to PIL Image while preserving color information
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            images.append(img)
            
            logger.info(f"Extracted page {page_num + 1}/{len(doc)}")
            
        return images
        
    except Exception as e:
        logger.error(f"Error extracting images from PDF: {str(e)}")
        raise
    finally:
        if 'doc' in locals():
            doc.close()


logger = logging.getLogger(__name__)

def detect_margins_improved(image: Image.Image) -> Tuple[int, int, int, int]:
    """
    Enhanced margin detection for scanned book pages using multiple detection methods
    and voting to ensure robust results.
    
    Args:
        image: PIL Image object of the scanned pages
        
    Returns:
        Tuple of (x, y, width, height) representing the detected content area
    """
    # Convert PIL Image to OpenCV format
    cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    height, width = cv_image.shape[:2]
    
    # Store multiple detection results for voting
    margin_candidates = []
    
    # Method 1: Gradient-based detection
    def detect_by_gradient():
        # Convert to grayscale
        gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Calculate gradients
        gradient_x = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
        gradient_y = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
        
        # Calculate gradient magnitude
        gradient_mag = np.sqrt(gradient_x**2 + gradient_y**2)
        
        # Normalize and convert to uint8
        gradient_mag = cv2.normalize(gradient_mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        
        # Threshold gradient magnitude
        _, thresh = cv2.threshold(gradient_mag, 30, 255, cv2.THRESH_BINARY)
        
        # Find horizontal and vertical projections
        h_proj = np.sum(thresh, axis=1)
        v_proj = np.sum(thresh, axis=0)
        
        # Find content boundaries using projections
        h_thresh = np.mean(h_proj) * 0.1
        v_thresh = np.mean(v_proj) * 0.1
        
        y_start = next((i for i, v in enumerate(h_proj) if v > h_thresh), 0)
        y_end = next((i for i, v in enumerate(h_proj[::-1]) if v > h_thresh), 0)
        y_end = height - y_end
        
        x_start = next((i for i, v in enumerate(v_proj) if v > v_thresh), 0)
        x_end = next((i for i, v in enumerate(v_proj[::-1]) if v > v_thresh), 0)
        x_end = width - x_end
        
        return x_start, y_start, x_end - x_start, y_end - y_start
    
    # Method 2: Content density analysis
    def detect_by_density():
        # Convert to grayscale
        gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
        
        # Apply adaptive thresholding
        binary = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=15,
            C=2
        )
        
        # Create density map using sliding window
        window_size = 50
        density = np.zeros_like(binary, dtype=float)
        
        for i in range(0, height - window_size, window_size):
            for j in range(0, width - window_size, window_size):
                region = binary[i:i+window_size, j:j+window_size]
                density[i:i+window_size, j:j+window_size] = np.sum(region) / (window_size * window_size)
        
        # Threshold density map
        _, density_thresh = cv2.threshold(density, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Find connected components
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(density_thresh.astype(np.uint8), 8)
        
        # Find the largest component (excluding background)
        if num_labels > 1:
            largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
            x = stats[largest_label, cv2.CC_STAT_LEFT]
            y = stats[largest_label, cv2.CC_STAT_TOP]
            w = stats[largest_label, cv2.CC_STAT_WIDTH]
            h = stats[largest_label, cv2.CC_STAT_HEIGHT]
            return x, y, w, h
        
        return 0, 0, width, height
    
    # Method 3: Edge-based detection with binding awareness
    def detect_by_edges():
        # Convert to grayscale
        gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
        
        # Apply Canny edge detection
        edges = cv2.Canny(gray, 50, 150)
        
        # Find vertical lines (potential binding area)
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, height//30))
        vertical_lines = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, vertical_kernel)
        
        # Find the center binding line
        center_region = vertical_lines[:, width//3:2*width//3]
        center_projection = np.sum(center_region, axis=0)
        binding_x = width//3 + np.argmax(center_projection)
        
        # Split image at binding and process each half
        def process_half(half_image, is_left):
            half_edges = cv2.Canny(half_image, 50, 150)
            h_proj = np.sum(half_edges, axis=1)
            v_proj = np.sum(half_edges, axis=0)
            
            h_thresh = np.mean(h_proj) * 0.1
            v_thresh = np.mean(v_proj) * 0.1
            
            y_start = next((i for i, v in enumerate(h_proj) if v > h_thresh), 0)
            y_end = next((i for i, v in enumerate(h_proj[::-1]) if v > h_thresh), 0)
            y_end = half_image.shape[0] - y_end
            
            if is_left:
                x_start = next((i for i, v in enumerate(v_proj) if v > v_thresh), 0)
                return x_start, y_start, binding_x - x_start, y_end - y_start
            else:
                x_end = next((i for i, v in enumerate(v_proj[::-1]) if v > v_thresh), 0)
                return binding_x, y_start, half_image.shape[1] - x_end, y_end - y_start
        
        left_half = gray[:, :binding_x]
        right_half = gray[:, binding_x:]
        
        left_margins = process_half(left_half, True)
        right_margins = process_half(right_half, False)
        
        # Combine results
        x = min(left_margins[0], right_margins[0])
        y = min(left_margins[1], right_margins[1])
        w = max(left_margins[2], right_margins[2])
        h = max(left_margins[3], right_margins[3])
        
        return x, y, w, h

    # Collect results from all methods
    try:
        margin_candidates.append(detect_by_gradient())
        margin_candidates.append(detect_by_density())
        margin_candidates.append(detect_by_edges())
    except Exception as e:
        logger.warning(f"Some detection methods failed: {str(e)}")

    if not margin_candidates:
        logger.warning("All detection methods failed, using default margins")
        return 0, 0, width, height

    # Voting system for final margins
    x_starts = [m[0] for m in margin_candidates]
    y_starts = [m[1] for m in margin_candidates]
    x_ends = [m[0] + m[2] for m in margin_candidates]
    y_ends = [m[1] + m[3] for m in margin_candidates]
    
    # Use median values for robustness
    final_x = int(np.median(x_starts))
    final_y = int(np.median(y_starts))
    final_w = int(np.median([m[2] for m in margin_candidates]))
    final_h = int(np.median([m[3] for m in margin_candidates]))
    
    # Add safety padding
    padding = 20
    final_x = max(0, final_x - padding)
    final_y = max(0, final_y - padding)
    final_w = min(width - final_x, final_w + 2 * padding)
    final_h = min(height - final_y, final_h + 2 * padding)
    
    return final_x, final_y, final_w, final_h

def crop_image(image: Image.Image, margins: Tuple[int, int, int, int]) -> Tuple[Image.Image, Image.Image]:
    """
    Crop image into left and right pages based on detected margins,
    with perspective correction and edge refinement.
    
    Args:
        image: PIL Image object
        margins: Tuple of (x, y, width, height)
        
    Returns:
        Tuple of (left_page, right_page) as PIL Images
    """
    x, y, w, h = margins
    
    # Calculate middle point with overlap to avoid cutting through content
    overlap = 20  # pixels of overlap between left and right pages
    middle = w // 2
    
    # Crop left and right pages with overlap
    left_image = image.crop((x, y, x + middle + overlap, y + h))
    right_image = image.crop((x + middle - overlap, y, x + w, y + h))
    
    return left_image, right_image

def preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    """
    Enhanced image preprocessing for optimal OCR results, including
    adaptive thresholding and noise reduction.
    
    Args:
        image: PIL Image object
        
    Returns:
        Processed PIL Image optimized for OCR
    """
    # Convert to OpenCV format
    cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    # Convert to grayscale
    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    
    # Apply adaptive thresholding
    """binary = cv2.adaptiveThreshold(
                    gray, 255,
                    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY,
                    blockSize=11,
                    C=2
                )"""
    
    # Reduce noise while preserving edges
    # denoised = cv2.fastNlMeansDenoising(binary, None, 10, 7, 21)
    
    # Improve contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    
    return Image.fromarray(enhanced)

def save_images(images: List[Tuple[Image.Image, Image.Image]], 
                output_folder: str, 
                pdf_name: str,
                quality: int = 95) -> None:
    """
    Save processed images with proper naming and organization.
    
    Args:
        images: List of (left_page, right_page) image tuples
        output_folder: Directory to save images
        pdf_name: Base name for output files
        quality: JPEG quality (0-100)
    """
    output_path = Path(output_folder)
    output_path.mkdir(parents=True, exist_ok=True)
    
    pdf_base_name = Path(pdf_name).stem
    
    for page_num, (left_image, right_image) in enumerate(images, start=1):
        # Create formatted page number with leading zeros
        page_str = f"{page_num:03d}"
        
        # Save left page
        left_path = output_path / f"{pdf_base_name}_page{page_str}_L.png"
        left_image.save(left_path, "PNG", optimize=True)
        
        # Save right page
        right_path = output_path / f"{pdf_base_name}_page{page_str}_R.png"
        right_image.save(right_path, "PNG", optimize=True)
        
        logger.info(f"Saved page {page_str} (left and right)")

def process_pdf_book(pdf_path: str, output_folder: str) -> None:
    """
    Main function to process a scanned book PDF.
    
    Args:
        pdf_path: Path to the PDF file
        output_folder: Directory to save processed images
    """
    try:
        logger.info(f"Starting to process PDF: {pdf_path}")
        
        # Extract images from PDF
        raw_images = extract_images_from_pdf(pdf_path)
        
        processed_pairs = []
        for idx, image in enumerate(raw_images, 1):
            logger.info(f"Processing page {idx}/{len(raw_images)}")
            
            # Detect margins
            # margins = detect_page_margins(image)
            # Use the improved margin detection
            margins = detect_margins_improved(image)
            
            # Split into left and right pages
            left_page, right_page = crop_image(image, margins)
            
            # Preprocess both pages for OCR
            left_processed = preprocess_image_for_ocr(left_page)
            right_processed = preprocess_image_for_ocr(right_page)
            
            processed_pairs.append((left_processed, right_processed))
        
        # Save all processed images
        pdf_name = os.path.basename(pdf_path)
        save_images(processed_pairs, output_folder, pdf_name)
        
        logger.info("Processing completed successfully")
        
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        raise



# Example usage
if __name__ == "__main__":
    pdf_path = "./facing_pages.pdf"
    # output_folder = "./splited_facing_pages"
    output_folder = "./cutout_images"
    process_pdf_book(pdf_path, output_folder)