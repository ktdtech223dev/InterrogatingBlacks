import React, { useEffect, useState } from 'react';

export default function Timer({ duration, onEnd, key: k }) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    setRemaining(duration);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onEnd?.();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [duration]);

  const pct = (remaining / duration) * 100;
  const color = pct > 50 ? '#00ff88' : pct > 25 ? '#FFD700' : '#FF3355';

  return (
    <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="h-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
      <div className="text-center text-sm font-bebas mt-1">
        {Math.ceil(remaining)}s
      </div>
    </div>
  );
}
