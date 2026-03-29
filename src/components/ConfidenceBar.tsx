interface ConfidenceBarProps {
  label: string;
  value: number; // 0 to 1
}

export function ConfidenceBar({ label, value }: ConfidenceBarProps) {
  const percentage = Math.round(value * 100);
  
  return (
    <div className="conf-bar-item">
      <span className="conf-label">{label}</span>
      <div className="progress-track">
        <div 
          className="progress-fill" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="conf-value">{value.toFixed(2)}</span>
    </div>
  );
}
