import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface OpenCvContextValue {
  isLoaded: boolean;
  cv: any | null;
}

const OpenCvContext = createContext<OpenCvContextValue | null>(null);

// Extend Window interface for cv
declare global {
  interface Window {
    cv: any;
  }
}

export function OpenCvProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [cvRef, setCvRef] = useState<any | null>(null);

  useEffect(() => {
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      console.log('[OpenCvProvider] OpenCV.js already loaded');
      setCvRef(window.cv);
      setIsLoaded(true);
      return;
    }

    // Create script element
    const script = document.createElement('script');
    const baseUrl = import.meta.env.BASE_URL || '/';
    script.src = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}opencv.js`;
    script.async = true;

    // Set up load handler
    script.onload = () => {
      console.log('[OpenCvProvider] opencv.js script loaded, waiting for runtime...');
      
      // OpenCV.js calls onRuntimeInitialized when ready
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          console.log('[OpenCvProvider] OpenCV.js runtime initialized');
          setCvRef(window.cv);
          setIsLoaded(true);
        };
      }
    };

    script.onerror = (err) => {
      console.error('[OpenCvProvider] Failed to load opencv.js:', err);
    };

    // Append to document
    document.body.appendChild(script);

    // Cleanup
    return () => {
      // Note: We don't remove the script on unmount because opencv.js
      // modifies global state that can't easily be cleaned up
      console.log('[OpenCvProvider] Cleanup (script remains in DOM)');
    };
  }, []);

  return (
    <OpenCvContext.Provider value={{ isLoaded, cv: cvRef }}>
      {children}
    </OpenCvContext.Provider>
  );
}

export function useOpenCv() {
  const ctx = useContext(OpenCvContext);
  if (!ctx) {
    throw new Error('useOpenCv must be used within OpenCvProvider');
  }
  return ctx;
}
