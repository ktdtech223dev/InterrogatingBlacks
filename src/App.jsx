import React from 'react';
import { Routes, Route } from 'react-router-dom';
import MainMenu from './pages/MainMenu';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import SoloMode from './pages/SoloMode';
import QuestionEditor from './pages/QuestionEditor';
import Achievements from './pages/Achievements';
import Spectator from './pages/Spectator';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainMenu />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/game" element={<Game />} />
      <Route path="/solo" element={<SoloMode />} />
      <Route path="/editor" element={<QuestionEditor />} />
      <Route path="/achievements" element={<Achievements />} />
      <Route path="/spectate" element={<Spectator />} />
    </Routes>
  );
}
