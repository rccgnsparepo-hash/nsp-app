import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // TURN is recommended for strict NATs. Add via env-injected config later.
];

export type CallKind = 'audio' | 'video';
export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended';

interface Args {
  sessionId: string;
  selfId: string;
  isCaller: boolean;
  kind: CallKind;
  onEnded?: () => void;
}

export const useWebRTC = ({ sessionId, selfId, isCaller, kind, onEnded }: Args) => {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const [status, setStatus] = useState<CallStatus>('connecting');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const sendSignal = useCallback(async (payload: any) => {
    await supabase.from('call_signals').insert({
      session_id: sessionId, from_user: selfId, payload,
    });
  }, [sessionId, selfId]);

  const cleanup = useCallback(() => {
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
    setStatus('ended');
  }, []);

  const hangup = useCallback(async () => {
    cleanup();
    await supabase.from('call_sessions').update({
      status: 'ended', ended_at: new Date().toISOString(),
    }).eq('id', sessionId);
    onEnded?.();
  }, [cleanup, sessionId, onEnded]);

  const toggleMute = useCallback(() => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (!audio) return;
    audio.enabled = !audio.enabled;
    setMuted(!audio.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (!video) return;
    video.enabled = !video.enabled;
    setCameraOff(!video.enabled);
  }, []);

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: kind === 'video' ? { width: 1280, height: 720 } : false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        console.error('getUserMedia failed', e);
        await hangup();
        return;
      }
      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (ev) => {
        ev.streams[0].getTracks().forEach(t => remoteStreamRef.current.addTrack(t));
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()));
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) sendSignal({ kind: 'ice', candidate: ev.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (!pcRef.current) return;
        const s = pcRef.current.connectionState;
        if (s === 'connected') setStatus('active');
        if (s === 'failed' || s === 'closed' || s === 'disconnected') {
          if (status !== 'ended') hangup();
        }
      };

      // realtime subscribe to signals from peer
      const ch = supabase
        .channel(`call:${sessionId}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `session_id=eq.${sessionId}` },
          async (payload) => {
            const row = payload.new as any;
            if (row.from_user === selfId) return;
            const data = row.payload;
            try {
              if (data.kind === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendSignal({ kind: 'answer', sdp: answer });
              } else if (data.kind === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              } else if (data.kind === 'ice' && data.candidate) {
                try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { console.warn('ice add fail', e); }
              } else if (data.kind === 'hangup') {
                hangup();
              }
            } catch (e) { console.error('signal handling fail', e); }
          })
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: `id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as any;
            if (row.status === 'ended' || row.status === 'declined') {
              if (status !== 'ended') hangup();
            }
          })
        .subscribe();
      channelRef.current = ch;

      if (isCaller) {
        // Replay any pre-existing answer/ice (in case callee already responded between insert and our subscribe)
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({ kind: 'offer', sdp: offer });
        // Mark session as active when callee picks up — we already track via connection state
      }
    };

    start();
    return () => {
      mounted = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isCaller, kind]);

  return { status, muted, cameraOff, localStream, remoteStream, hangup, toggleMute, toggleCamera };
};
