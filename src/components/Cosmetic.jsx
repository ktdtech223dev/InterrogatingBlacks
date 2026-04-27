import React from 'react';

export default function Cosmetic({ cosmetic, unlocked, active, onActivate }) {
  return (
    <div className={`p-3 rounded border ${unlocked ? 'border-yellow-500' : 'border-gray-700 opacity-50'}`}>
      <div className="font-bebas text-lg">{cosmetic.name}</div>
      <div className="text-xs text-gray-400">{cosmetic.type}</div>
      {unlocked && (
        <button onClick={onActivate} className={`btn mt-2 text-xs ${active ? 'btn-primary' : ''}`}>
          {active ? 'ACTIVE' : 'SET ACTIVE'}
        </button>
      )}
      {!unlocked && (
        <div className="text-xs mt-1 text-gray-500">Unlock: {cosmetic.unlock_requirement}</div>
      )}
    </div>
  );
}
