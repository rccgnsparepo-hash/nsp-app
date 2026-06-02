import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
  type LocalTrackPublication,
  createLocalTracks,
} from 'livekit-client';
import { supabase } from '@/integrations/supabase/client';
import type { CallKind } from './useWebRTC';

type Status = 'connecting' | 'active' | 'ended';

interface Opts {
  sessionId: string;
  selfId: string;
  isCaller: boolean;
  kind: CallKind;
  onEnded: () => void;
}

export function useLiveKit({ sessionId, kind, isCaller, onEnded }: Opts) {
  const [status, setStatus] = useState<Status>('connecting');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const roomRef = useRef<Room | null>(null);
  const endedRef = useRef(false);

  const hangup = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      await roomRef.current?.disconnect();
    } catch {}
    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    } catch {}
    setStatus('ended');
    onEnded();
  }, [sessionId, onEnded]);

  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('livekit-token', {
          body: { session_id: sessionId },
        });
        if (error || !data?.token) throw error ?? new Error('No token');
        if (cancelled) return;

        room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        const remote = new MediaStream();
        setRemoteStream(remote);

        room
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio || track.kind === Track.Kind.Video) {
              const ms = (track as any).mediaStream as MediaStream | undefined;
              const mst = (track as any).mediaStreamTrack as MediaStreamTrack | undefined;
              if (mst) remote.addTrack(mst);
              else if (ms) ms.getTracks().forEach((t) => remote.addTrack(t));
              setRemoteStream(new MediaStream(remote.getTracks()));
              setStatus('active');
            }
          })
          .on(RoomEvent.ParticipantConnected, () => setStatus('active'))
          .on(RoomEvent.Disconnected, () => hangup());

        await room.connect(data.url, data.token);

        const tracks = await createLocalTracks({
          audio: true,
          video: kind === 'video' ? { facingMode: 'user' } : false,
        });
        const local = new MediaStream();
        for (const t of tracks) {
          await room.localParticipant.publishTrack(t);
          local.addTrack(t.mediaStreamTrack);
        }
        setLocalStream(local);

        if (isCaller) {
          await supabase
            .from('call_sessions')
            .update({ status: 'active', started_at: new Date().toISOString() })
            .eq('id', sessionId);
        }
      } catch (e) {
        console.error('[livekit] failed', e);
        hangup();
      }
    })();

    return () => {
      cancelled = true;
      try { roomRef.current?.disconnect(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const toggleMute = useCallback(async () => {
    const r = roomRef.current; if (!r) return;
    const enabled = !muted;
    await r.localParticipant.setMicrophoneEnabled(!enabled);
    setMuted(enabled);
  }, [muted]);

  const toggleCamera = useCallback(async () => {
    const r = roomRef.current; if (!r) return;
    const enabled = !cameraOff;
    await r.localParticipant.setCameraEnabled(!enabled);
    setCameraOff(enabled);
  }, [cameraOff]);

  return { status, muted, cameraOff, localStream, remoteStream, hangup, toggleMute, toggleCamera };
}
