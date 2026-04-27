import { useEffect } from 'react';

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.3, delay = 0) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(volume, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  } catch (e) {}
}

export const SOUNDS = {
  correct() {
    playTone(523, 0.1, 'sine', 0.4);
    playTone(659, 0.1, 'sine', 0.4, 0.1);
    playTone(784, 0.2, 'sine', 0.4, 0.2);
  },
  wrong() {
    playTone(150, 0.4, 'sawtooth', 0.3);
    playTone(120, 0.3, 'sawtooth', 0.2, 0.1);
  },
  bet_win() {
    playTone(880, 0.05, 'sine', 0.3);
    playTone(1100, 0.05, 'sine', 0.3, 0.06);
    playTone(1320, 0.1, 'sine', 0.3, 0.12);
    playTone(1760, 0.2, 'sine', 0.3, 0.22);
  },
  bet_lose() {
    playTone(220, 0.15, 'sawtooth', 0.2);
    playTone(196, 0.15, 'sawtooth', 0.2, 0.15);
    playTone(175, 0.15, 'sawtooth', 0.2, 0.3);
    playTone(147, 0.4, 'sawtooth', 0.2, 0.45);
  },
  broke_boy() {
    playTone(300, 0.1, 'square', 0.2);
    playTone(200, 0.1, 'square', 0.2, 0.1);
    playTone(100, 0.3, 'square', 0.3, 0.2);
  },
  pb() {
    [523, 659, 784, 1047].forEach((f, i) => {
      playTone(f, 0.15, 'sine', 0.4, i * 0.1);
    });
    playTone(1047, 0.5, 'sine', 0.3, 0.5);
  },
  tick() { playTone(800, 0.05, 'sine', 0.2); },
  shop_open() {
    [800, 1000, 1200, 1600].forEach((f, i) => playTone(f, 0.1, 'sine', 0.2, i * 0.08));
  },
  achievement() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => playTone(f, 0.1, 'sine', 0.35, i * 0.08));
  },
  countdown() { playTone(440, 0.1, 'square', 0.15); },
  game_over() {
    [784, 659, 523, 392].forEach((f, i) => playTone(f, 0.2, 'sine', 0.3, i * 0.15));
  }
};

export default function SoundEngine({ events }) {
  useEffect(() => {
    if (!events?.length) return;
    events.forEach(e => SOUNDS[e]?.());
  }, [events]);
  return null;
}
