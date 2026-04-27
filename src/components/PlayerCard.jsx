import React from 'react';

export default function PlayerCard({ player, isLast, isHost, isMe }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg relative"
      style={{
        background: 'var(--bg3)',
        borderLeft: `4px solid ${player.color}`
      }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center font-bebas text-xl"
        style={{ background: player.color, color: 'white' }}
      >
        {player.initial || player.name?.[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-bebas text-lg truncate">{player.name}</div>
          {isHost && <span className="text-xs px-1 bg-yellow-500 text-black rounded">HOST</span>}
          {isMe && <span className="text-xs px-1 bg-blue-500 text-white rounded">YOU</span>}
          {isLast && <span className="text-xs px-1 bg-red-700 text-white rounded">LAST</span>}
        </div>
        {player.title && <div className="text-xs text-gray-400">{player.title}</div>}
      </div>
      <div className="font-bebas text-xl text-yellow-400">${player.points || 0}</div>
    </div>
  );
}
