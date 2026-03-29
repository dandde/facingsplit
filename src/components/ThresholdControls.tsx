import { ThresholdParams } from '../types/pipeline';

interface ThresholdControlsProps {
  thresholds: ThresholdParams;
  setThresholds: (t: ThresholdParams) => void;
}

export function ThresholdControls({ thresholds, setThresholds }: ThresholdControlsProps) {
  const handleChange = (key: keyof ThresholdParams, value: number) => {
    setThresholds({ ...thresholds, [key]: value });
  };

  const resetToDefault = () => {
    setThresholds({
      claheClip: 2.0,
      binaryThresh: 30,
      adaptiveBlockSize: 11,
      adaptiveC: 2,
      cannyLow: 50,
      cannyHigh: 150,
    });
  };

  return (
    <div className="threshold-controls">
      <div className="sidebar-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
           <span className="section-label" style={{ marginBottom: 0 }}>Thresholding Settings</span>
           <button 
             className="btn-secondary" 
             style={{ fontSize: '10px', padding: '2px 6px' }}
             onClick={resetToDefault}
           >
             Reset
           </button>
        </div>

        {/* Enhancement */}
        <div className="control-group">
          <div className="control-header">
            <label>CLAHE Clip Limit</label>
            <span className="control-val">{thresholds.claheClip.toFixed(1)}</span>
          </div>
          <input 
            type="range" min="0.1" max="10" step="0.1" 
            value={thresholds.claheClip} 
            onChange={(e) => handleChange('claheClip', parseFloat(e.target.value))}
          />
        </div>

        {/* Gradient */}
        <div className="control-group">
          <div className="control-header">
            <label>Sobel Binary Thresh</label>
            <span className="control-val">{thresholds.binaryThresh}</span>
          </div>
          <input 
            type="range" min="1" max="255" step="1" 
            value={thresholds.binaryThresh} 
            onChange={(e) => handleChange('binaryThresh', parseInt(e.target.value))}
          />
        </div>

        {/* Canny */}
        <div className="control-group">
          <div className="control-header">
            <label>Canny Low</label>
            <span className="control-val">{thresholds.cannyLow}</span>
          </div>
          <input 
            type="range" min="1" max="500" step="1" 
            value={thresholds.cannyLow} 
            onChange={(e) => handleChange('cannyLow', parseInt(e.target.value))}
          />
        </div>

        <div className="control-group">
          <div className="control-header">
            <label>Canny High</label>
            <span className="control-val">{thresholds.cannyHigh}</span>
          </div>
          <input 
            type="range" min="1" max="500" step="1" 
            value={thresholds.cannyHigh} 
            onChange={(e) => handleChange('cannyHigh', parseInt(e.target.value))}
          />
        </div>
        
        {/* Adaptive */}
        <div className="control-group">
          <div className="control-header">
            <label>Adaptive BlockSize</label>
            <span className="control-val">{thresholds.adaptiveBlockSize}</span>
          </div>
          <input 
            type="range" min="3" max="51" step="2" // Must be odd
            value={thresholds.adaptiveBlockSize} 
            onChange={(e) => handleChange('adaptiveBlockSize', parseInt(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
