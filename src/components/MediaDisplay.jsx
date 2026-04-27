import React from 'react';

function youtubeEmbed(url) {
  try {
    const u = new URL(url);
    let id = '';
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else id = u.searchParams.get('v') || '';
    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`;
  } catch { return url; }
}

export default function MediaDisplay({ url, type }) {
  if (!url) return null;
  if (type === 'youtube' || (typeof url === 'string' && (url.includes('youtube.com') || url.includes('youtu.be')))) {
    return (
      <iframe
        src={youtubeEmbed(url)}
        className="w-full max-w-3xl aspect-video rounded-lg"
        allow="autoplay; encrypted-media"
        allowFullScreen
      />
    );
  }
  if (type === 'video') {
    return (
      <video src={url} autoPlay muted loop playsInline className="max-h-[70vh] rounded-lg" />
    );
  }
  return <img src={url} alt="" className="max-h-[70vh] rounded-lg" />;
}
