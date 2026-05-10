import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import CallScreen from './CallScreen';

interface Incoming {
  id: string;
  caller_id: string;
  kind: 'audio' | 'video';
  caller_name: string;
  caller_avatar: string | null;
}

interface ActiveCall {
  sessionId: string;
  isCaller: boolean;
  kind: 'audio' | 'video';
  peerName: string;
  peerAvatar: string | null;
}

const IncomingCallOverlay = () => {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`incoming-calls:${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${user.id}` },
        async (payload) => {
          const row = payload.new as any;
          if (row.status !== 'ringing') return;
          const { data: prof } = await supabase.from('profiles')
            .select('full_name, profile_image_url').eq('id', row.caller_id).maybeSingle();
          setIncoming({
            id: row.id, caller_id: row.caller_id, kind: row.kind,
            caller_name: prof?.full_name ?? 'Someone',
            caller_avatar: prof?.profile_image_url ?? null,
          });
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: `callee_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as any;
          if (row.status !== 'ringing' && incoming?.id === row.id) setIncoming(null);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, incoming?.id]);

  // listen for outgoing calls placed from elsewhere
  useEffect(() => {
    const handler = (e: any) => setActive(e.detail);
    window.addEventListener('nsp:start-call', handler);
    return () => window.removeEventListener('nsp:start-call', handler);
  }, []);

  const accept = async () => {
    if (!incoming) return;
    await supabase.from('call_sessions').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', incoming.id);
    setActive({
      sessionId: incoming.id, isCaller: false, kind: incoming.kind,
      peerName: incoming.caller_name, peerAvatar: incoming.caller_avatar,
    });
    setIncoming(null);
  };

  const decline = async () => {
    if (!incoming) return;
    await supabase.from('call_sessions').update({ status: 'declined', ended_at: new Date().toISOString() }).eq('id', incoming.id);
    setIncoming(null);
  };

  return (
    <>
      <AnimatePresence>
        {incoming && (
          <motion.div
            initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 inset-x-0 z-[90] p-3 safe-top"
          >
            <div className="max-w-md mx-auto rounded-2xl bg-card border border-border neumorphic shadow-2xl p-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted overflow-hidden">
                {incoming.caller_avatar ?
                  <img src={incoming.caller_avatar} className="w-full h-full object-cover" /> :
                  <div className="w-full h-full flex items-center justify-center font-bold text-foreground">{incoming.caller_name[0]?.toUpperCase()}</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{incoming.caller_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {incoming.kind === 'video' ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
                  Incoming {incoming.kind} call…
                </p>
              </div>
              <button onClick={decline} className="w-10 h-10 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                <PhoneOff className="w-4 h-4" />
              </button>
              <button onClick={accept} className="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center">
                <Phone className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && user && (
          <CallScreen
            sessionId={active.sessionId}
            selfId={user.id}
            isCaller={active.isCaller}
            kind={active.kind}
            peerName={active.peerName}
            peerAvatar={active.peerAvatar}
            onClose={() => setActive(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default IncomingCallOverlay;
