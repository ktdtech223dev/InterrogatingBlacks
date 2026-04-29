import React, { useEffect, useRef, useState } from 'react';

function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    let id = '';
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else if (u.pathname.includes('/embed/')) id = u.pathname.split('/embed/')[1].split('/')[0];
    else if (u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1].split('/')[0];
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&playsinline=1` : url;
  } catch { return url; }
}

function detectType(url, declaredType) {
  if (declaredType && declaredType !== '') return declaredType;
  if (typeof url !== 'string') return 'image';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return 'video';
  return 'image';
}

export default function MediaDisplay({ url, type }) {
  const videoRef = useRef(null);
  const [videoErr, setVideoErr] = useState(null);
  const [needsTap, setNeedsTap] = useState(false);

  const resolved = detectType(url, type);

  useEffect(() => {
    if (resolved === 'video' && videoRef.current) {
      const v = videoRef.current;
      v.muted = true;
      const p = v.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => setNeedsTap(true));
      }
    }
  }, [url, resolved]);

  if (!url) return null;

  if (resolved === 'youtube') {
    return (
      <iframe
        src={youtubeEmbed(url)}
        className="w-full max-w-3xl aspect-video rounded-lg border-2 border-yellow-500"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="YouTube video"
      />
    );
  }

  if (resolved === 'video') {
    return (
      <div className="relative">
        <video
          ref={videoRef}
          src={url}
          autoPlay
          muted
          loop
          playsInline
          controls
          preload="auto"
          onError={(e) => setVideoErr(e?.target?.error?.message || 'failed to load')}
          className="max-h-[70vh] max-w-full rounded-lg border-2 border-yellow-500"
        />
        {needsTap && (
          <button
            onClick={() => { videoRef.current?.play(); setNeedsTap(false); }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 text-yellow-400 font-bebas text-3xl rounded-lg"
          >▶ TAP TO PLAY</button>
        )}
        {videoErr && (
          <div className="text-red-400 text-sm mt-2">Video error: {videoErr} — <a href={url} target="_blank" rel="noopener" className="underline">open file</a></div>
        )}
      </div>
    );
  }

  // image (default)
  return (
    <img
      src={url}
      alt=""
      className="max-h-[70vh] max-w-full rounded-lg border-2 border-yellow-500 object-contain"
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}
