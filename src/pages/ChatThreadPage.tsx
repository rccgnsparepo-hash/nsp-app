import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Check, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

interface Msg {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read: boolean;
}

const ChatThreadPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Stable channel name (sorted user IDs)
  const channelName = user && userId
    ? `chat:${[user.id, userId].sort().join(':')}`
    : null;

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('id, full_name, profile_image_url').eq('id', userId).maybeSingle()
      .then(({ data }) => setOther(data));
  }, [userId]);

  const loadMessages = async () => {
    if (!user || !userId) return;
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    if (error) { toast.error(error.message); return; }
    setMessages(data || []);
    await supabase.from('direct_messages').update({ read: true })
      .eq('sender_id', userId).eq('recipient_id', user.id).eq('read', false);
  };

  useEffect(() => { loadMessages(); }, [user, userId]);

  // Realtime: messages + read updates + typing broadcast
  useEffect(() => {
    if (!user || !userId || !channelName) return;
    const ch = supabase
      .channel(channelName, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m = payload.new as Msg;
        const inThread = (m.sender_id === user.id && m.recipient_id === userId) ||
                          (m.sender_id === userId && m.recipient_id === user.id);
        if (!inThread) return;
        setMessages(prev => prev.find(x => x.id === m.id) ? prev : [...prev, m]);
        if (m.recipient_id === user.id) {
          supabase.from('direct_messages').update({ read: true }).eq('id', m.id);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m = payload.new as Msg;
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, ...m } : x));
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.from !== userId) return;
        setOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 2500);
      })
      .on('broadcast', { event: 'stop_typing' }, (payload) => {
        if (payload.payload?.from !== userId) return;
        setOtherTyping(false);
      })
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [user, userId, channelName]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, otherTyping]);

  const broadcastTyping = (event: 'typing' | 'stop_typing') => {
    if (!channelRef.current || !user) return;
    channelRef.current.send({ type: 'broadcast', event, payload: { from: user.id } });
  };

  const handleChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v.trim() && now - lastTypingSentRef.current > 1500) {
      broadcastTyping('typing');
      lastTypingSentRef.current = now;
    }
    if (!v.trim()) broadcastTyping('stop_typing');
  };

  const send = async () => {
    if (!user || !userId || !text.trim()) return;
    setSending(true);
    const content = text.trim();
    setText('');
    broadcastTyping('stop_typing');
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user.id, recipient_id: userId, content,
    });
    if (error) { toast.error(error.message); setText(content); }
    setSending(false);
  };

  // Index of last own message for "seen" indicator
  const lastOwnIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id) return i;
    }
    return -1;
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 glass border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="w-9 h-9 rounded-full bg-muted overflow-hidden">
            {other?.profile_image_url ? (
              <img src={other.profile_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-muted-foreground">
                {other?.full_name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{other?.full_name || 'Chat'}</p>
            <p className="text-[10px] text-muted-foreground">
              {otherTyping ? <span className="text-primary">typing…</span> : 'Realtime · End-to-end'}
            </p>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Say hi to start the conversation</p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const showSeen = mine && i === lastOwnIdx;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card text-foreground rounded-bl-sm neumorphic-sm'
              }`}>
                <p className="text-sm break-words whitespace-pre-wrap">{m.content}</p>
                <div className={`flex items-center gap-1 justify-end mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  <span className="text-[9px]">{format(new Date(m.created_at), 'h:mm a')}</span>
                  {mine && (
                    m.read
                      ? <CheckCheck className="w-3 h-3" />
                      : <Check className="w-3 h-3" />
                  )}
                </div>
              </div>
              {showSeen && m.read && (
                <span className="text-[9px] text-muted-foreground mt-0.5 mr-1">Seen</span>
              )}
            </motion.div>
          );
        })}

        <AnimatePresence>
          {otherTyping && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex justify-start"
            >
              <div className="bg-card neumorphic-sm rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 glass border-t border-border safe-bottom">
        <div className="flex items-center gap-2 px-3 py-3 max-w-lg mx-auto">
          <Input
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={() => broadcastTyping('stop_typing')}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder="Type a message…"
            className="bg-muted border-0 neumorphic-inset rounded-full"
          />
          <Button onClick={send} disabled={sending || !text.trim()} className="rounded-full bg-primary text-primary-foreground h-10 w-10 p-0 flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatThreadPage;
