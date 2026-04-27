import React from 'react';
import PlayerCard from './PlayerCard';

export default function Scoreboard({ players, hostId, mySocketId }) {
  const last = players[players.length - 1];
  return (
    <div className="space-y-2">
      <h3 className="font-bebas text-2xl text-yellow-400">SCORES</h3>
      {players.map(p => (
        <PlayerCard
          key={p.id}
          player={p}
          isLast={p.id === last?.id}
          isHost={p.id === hostId}
          isMe={p.id === mySocketId}
        />
      ))}
    </div>
  );
}
