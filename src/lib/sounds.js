/**
 * Darmowe ścieżki i SFX do Reels / Stories (Mixkit — royalty-free).
 */

export const FREE_TRACKS = [
  {
    id: "aurora-house",
    title: "Tech House Vibes",
    mood: "energetic",
    duration: "2:30",
    url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
  },
  {
    id: "dreamy",
    title: "Dreaming Big",
    mood: "chill",
    duration: "2:10",
    url: "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3",
  },
  {
    id: "hip-hop",
    title: "Hip Hop 02",
    mood: "urban",
    duration: "2:00",
    url: "https://assets.mixkit.co/music/preview/mixkit-hip-hop-02-738.mp3",
  },
  {
    id: "cat-walk",
    title: "Cat Walk",
    mood: "playful",
    duration: "1:45",
    url: "https://assets.mixkit.co/music/preview/mixkit-cat-walk-371.mp3",
  },
  {
    id: "sunny",
    title: "Sunny Morning",
    mood: "happy",
    duration: "2:15",
    url: "https://assets.mixkit.co/music/preview/mixkit-sunny-morning-in-the-city-49.mp3",
  },
  {
    id: "deep",
    title: "Deep Urban",
    mood: "mood",
    duration: "2:20",
    url: "https://assets.mixkit.co/music/preview/mixkit-deep-urban-157.mp3",
  },
  {
    id: "piano",
    title: "Serene Piano",
    mood: "soft",
    duration: "2:05",
    url: "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
  },
  {
    id: "groove",
    title: "Life is a Dream",
    mood: "groove",
    duration: "2:00",
    url: "https://assets.mixkit.co/music/preview/mixkit-a-very-happy-christmas-897.mp3",
  },
];

export const FREE_SFX = [
  {
    id: "whoosh",
    title: "Whoosh",
    url: "https://assets.mixkit.co/sfx/preview/mixkit-fast-sword-whoosh-811.mp3",
  },
  {
    id: "click",
    title: "Soft click",
    url: "https://assets.mixkit.co/sfx/preview/mixkit-modern-technology-select-3124.mp3",
  },
  {
    id: "pop",
    title: "Pop",
    url: "https://assets.mixkit.co/sfx/preview/mixkit-message-pop-alert-2354.mp3",
  },
  {
    id: "camera",
    title: "Shutter",
    url: "https://assets.mixkit.co/sfx/preview/mixkit-camera-shutter-click-1133.mp3",
  },
  {
    id: "bell",
    title: "Bell",
    url: "https://assets.mixkit.co/sfx/preview/mixkit-correct-answer-tone-2870.mp3",
  },
];

export function playBeep(freq = 880, ms = 120) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.08;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, ms);
  } catch {
    /* ignore */
  }
}
