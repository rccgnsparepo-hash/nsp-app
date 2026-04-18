import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  onRecorded: (file: File) => void;
  recordedFile: File | null;
  onClear: () => void;
}

const VoiceRecorder = ({ onRecorded, recordedFile, onClear }: Props) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrl = recordedFile ? URL.createObjectURL(recordedFile) : null;

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const ext = (mr.mimeType || 'audio/webm').includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `voicenote-${Date.now()}.${ext}`, { type: blob.type });
        onRecorded(file);
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
    } catch (e: any) {
      toast.error('Microphone access denied');
    }
  };

  const stop = () => {
    mediaRecRef.current?.stop();
    setRecording(false);
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-3">
      {!recordedFile && (
        <div className="flex items-center gap-3 p-4 bg-muted rounded-xl neumorphic-inset">
          {!recording ? (
            <Button type="button" onClick={start} className="bg-primary text-primary-foreground rounded-full w-12 h-12 p-0">
              <Mic className="w-5 h-5" />
            </Button>
          ) : (
            <Button type="button" onClick={stop} className="bg-destructive text-destructive-foreground rounded-full w-12 h-12 p-0 animate-pulse">
              <Square className="w-5 h-5" />
            </Button>
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{recording ? 'Recording…' : 'Tap to record'}</p>
            <p className="text-xs text-muted-foreground">{fmt(seconds)}</p>
          </div>
        </div>
      )}

      {recordedFile && previewUrl && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
          <button type="button" onClick={togglePlay} className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{recordedFile.name}</p>
            <audio
              ref={audioRef}
              src={previewUrl}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />
          </div>
          <button type="button" onClick={onClear} className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-destructive" />
          </button>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
