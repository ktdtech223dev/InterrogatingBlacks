import React, { useEffect } from 'react';
import { SOUNDS } from './SoundEngine';

export default function AchievementToast({ achievement, onDismiss }) {
  useEffect(() => {
    SOUNDS.achievement();
    const t = setTimeout(() => onDismiss?.(), 5000);
    return () => clearTimeout(t);
  }, []);

  if (!achievement) return null;
  return (
    <div className={`toast rarity-${achievement.rarity} pop-in`}
      style={{ borderLeftColor: 'currentColor' }}>
      <div className="text-xs uppercase opacity-70 font-bebas">Achievement Unlocked</div>
      <div className="flex items-center gap-3 mt-1">
        <div className="text-4xl">{achievement.icon}</div>
        <div>
          <div className="font-bebas text-xl text-white">{achievement.name}</div>
          <div className="text-sm text-gray-300">{achievement.description}</div>
        </div>
      </div>
    </div>
  );
}
