import { useRef, useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

const VoicePostPlayer = ({ src }: { src: string }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const fmt = (s: number) => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';

  return (
    <div className="flex items-center gap-3 p-4 bg-muted/50">
      <button
        onClick={toggle}
        className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground neumorphic-sm flex-shrink-0"
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Mic className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Voice Note</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {fmt(progress)} / {fmt(duration)}
          </span>
        </div>
        <div className="h-1.5 bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
          />
        </div>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => setProgress((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        className="hidden"
      />
    </div>
  );
};

export default VoicePostPlayer;
