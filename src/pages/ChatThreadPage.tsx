import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Send } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch other user
  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('id, full_name, profile_image_url').eq('id', userId).maybeSingle()
      .then(({ data }) => setOther(data));
  }, [userId]);

  // Initial load
  const loadMessages = async () => {
    if (!user || !userId) return;
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    if (error) { toast.error(error.message); return; }
    setMessages(data || []);
    // Mark incoming as read
    await supabase.from('direct_messages').update({ read: true })
      .eq('sender_id', userId).eq('recipient_id', user.id).eq('read', false);
  };

  useEffect(() => { loadMessages(); }, [user, userId]);

  // Realtime
  useEffect(() => {
    if (!user || !userId) return;
    const ch = supabase
      .channel(`thread-${user.id}-${userId}`)
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, userId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!user || !userId || !text.trim()) return;
    setSending(true);
    const content = text.trim();
    setText('');
    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user.id, recipient_id: userId, content,
    });
    if (error) { toast.error(error.message); setText(content); }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
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
            <p className="text-[10px] text-muted-foreground">Realtime · End-to-end</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Say hi to start the conversation</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === user?.id;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card text-foreground rounded-bl-sm neumorphic-sm'
              }`}>
                <p className="text-sm break-words whitespace-pre-wrap">{m.content}</p>
                <p className={`text-[9px] mt-1 ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {format(new Date(m.created_at), 'h:mm a')}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 glass border-t border-border safe-bottom">
        <div className="flex items-center gap-2 px-3 py-3 max-w-lg mx-auto">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
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
