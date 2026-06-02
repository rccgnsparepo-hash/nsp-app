import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { CallKind } from '@/hooks/useWebRTC';
import { useLiveKit } from '@/hooks/useLiveKit';

interface Props {
  sessionId: string;
  selfId: string;
  isCaller: boolean;
  kind: CallKind;
  peerName: string;
  peerAvatar?: string | null;
  onClose: () => void;
}

const CallScreen = ({ sessionId, selfId, isCaller, kind, peerName, peerAvatar, onClose }: Props) => {
  const { status, muted, cameraOff, localStream, remoteStream, hangup, toggleMute, toggleCamera } =
    useLiveKit({ sessionId, selfId, isCaller, kind, onEnded: onClose });

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { if (localRef.current && localStream) localRef.current.srcObject = localStream; }, [localStream]);
  useEffect(() => { if (remoteRef.current && remoteStream) remoteRef.current.srcObject = remoteStream; }, [remoteStream]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col"
    >
      {kind === 'video' ? (
        <>
          <video ref={remoteRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover bg-black" />
          {!remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <div className="text-center">
                {peerAvatar ? <img src={peerAvatar} className="w-24 h-24 rounded-full mx-auto mb-3 object-cover" /> :
                  <div className="w-24 h-24 rounded-full mx-auto mb-3 bg-white/10 flex items-center justify-center text-3xl font-bold">{peerName[0]?.toUpperCase()}</div>}
                <p className="text-lg font-semibold">{peerName}</p>
                <p className="text-xs opacity-70 mt-1">{status === 'active' ? 'Connected' : 'Connecting…'}</p>
              </div>
            </div>
          )}
          <video ref={localRef} autoPlay playsInline muted className="absolute top-6 right-4 w-28 h-40 rounded-xl object-cover border border-white/20 bg-black" />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-white">
          {peerAvatar ? <img src={peerAvatar} className="w-32 h-32 rounded-full mb-4 object-cover" /> :
            <div className="w-32 h-32 rounded-full mb-4 bg-white/10 flex items-center justify-center text-4xl font-bold">{peerName[0]?.toUpperCase()}</div>}
          <p className="text-2xl font-semibold">{peerName}</p>
          <p className="text-sm opacity-70 mt-2">{status === 'active' ? 'Voice call · Connected' : 'Calling…'}</p>
        </div>
      )}

      <div className="absolute bottom-0 inset-x-0 pb-10 pt-6 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center gap-5 safe-bottom">
        <button onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? 'bg-white text-black' : 'bg-white/20 text-white'}`}>
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        {kind === 'video' && (
          <button onClick={toggleCamera}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${cameraOff ? 'bg-white text-black' : 'bg-white/20 text-white'}`}>
            {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
        )}
        <button onClick={hangup} className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
          <PhoneOff className="w-7 h-7" />
        </button>
      </div>
    </motion.div>
  );
};

export default CallScreen;
