import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { ArrowLeft, Send, Check, CheckCheck, Paperclip, Image as ImageIcon, Video as VideoIcon, File as FileIcon, X, Phone, Download, Reply, CornerUpLeft } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { uploadChatMedia, formatBytes, CHAT_MEDIA_LIMITS } from '@/lib/chatMedia';

interface Msg {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
  read: boolean;
  media_url?: string | null;
  media_type?: 'image' | 'video' | 'file' | null;
  media_name?: string | null;
  media_size?: number | null;
  media_mime?: string | null;
}

const ChatThreadPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const channelName = user && userId ? `chat:${[user.id, userId].sort().join(':')}` : null;

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
    setMessages((data as any) || []);
    await supabase.from('direct_messages').update({ read: true })
      .eq('sender_id', userId).eq('recipient_id', user.id).eq('read', false);
  };

  useEffect(() => { loadMessages(); }, [user, userId]);

  useEffect(() => {
    if (!user || !userId || !channelName) return;
    const ch = supabase
      .channel(channelName, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, (payload) => {
        const m = payload.new as Msg;
        const inThread = (m.sender_id === user.id && m.recipient_id === userId) ||
                          (m.sender_id === userId && m.recipient_id === user.id);
        if (!inThread) return;
        setMessages(prev => {
          if (prev.find(x => x.id === m.id)) return prev;
          // Replace any optimistic temp from this sender with same content within 30s
          const tempIdx = prev.findIndex(x => x.id.startsWith('tmp-') && x.sender_id === m.sender_id && x.content === m.content);
          if (tempIdx >= 0) { const next = [...prev]; next[tempIdx] = m; return next; }
          return [...prev, m];
        });
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
    if (!scrollRef.current) return;
    // First paint after messages load: jump instantly to bottom (no glitch / no animation)
    if (!didInitialScrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      didInitialScrollRef.current = true;
      return;
    }
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
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

  const previewOf = (m: Msg) => {
    if (m.media_type === 'image') return '📷 Photo';
    if (m.media_type === 'video') return '🎥 Video';
    if (m.media_type === 'file') return `📎 ${m.media_name || 'File'}`;
    return m.content || '';
  };

  const send = async () => {
    if (!user || !userId || !text.trim()) return;
    const raw = text.trim();
    // Embed quoted reply so the recipient sees what was being replied to
    const content = replyTo
      ? `↪ ${(replyTo.sender_id === user.id ? 'You' : (other?.full_name || 'Them'))}: ${previewOf(replyTo).slice(0, 120)}\n${raw}`
      : raw;
    const tempId = `tmp-${Date.now()}`;
    const optimistic: Msg = {
      id: tempId, sender_id: user.id, recipient_id: userId,
      content, created_at: new Date().toISOString(), read: false,
    };
    setMessages(prev => [...prev, optimistic]);
    setText('');
    setReplyTo(null);
    broadcastTyping('stop_typing');
    const { data, error } = await supabase.from('direct_messages').insert({
      sender_id: user.id, recipient_id: userId, content,
    }).select().single();
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      toast.error(error.message); setText(raw);
      return;
    }
    setMessages(prev => prev.map(m => m.id === tempId ? (data as any) : m));
  };

  const sendMedia = async (file: File) => {
    if (!user || !userId) return;
    setShowAttach(false);
    setUploading(true);
    try {
      const media = await uploadChatMedia(file, user.id, userId);
      const { error } = await supabase.from('direct_messages').insert({
        sender_id: user.id, recipient_id: userId, content: '', ...media,
      });
      if (error) throw error;
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const downloadMedia = async (m: Msg) => {
    if (!m.media_url) return;
    try {
      const res = await fetch(m.media_url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m.media_name || `chat-${m.id}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(m.media_url, '_blank');
    }
  };

  const startCall = async (kind: 'audio' | 'video') => {
    if (!user || !userId || !other) return;
    try {
      // request mic/cam permission upfront
      await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' });
    } catch {
      toast.error(`${kind === 'video' ? 'Camera/microphone' : 'Microphone'} permission required`);
      return;
    }
    const { data, error } = await supabase.from('call_sessions').insert({
      caller_id: user.id, callee_id: userId, kind, status: 'ringing',
    }).select().single();
    if (error) { toast.error(error.message); return; }
    window.dispatchEvent(new CustomEvent('nsp:start-call', {
      detail: { sessionId: data.id, isCaller: true, kind, peerName: other.full_name, peerAvatar: other.profile_image_url },
    }));
  };

  const lastOwnIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id) return i;
    }
    return -1;
  })();

  return (
    <div className="min-h-screen bg-background flex flex-col chat-doodle-bg">
      <header className="sticky top-0 z-40 glass border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => userId && navigate(`/u/${userId}`)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
            <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
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
                {otherTyping ? <span className="text-primary">typing…</span> : 'Tap for profile'}
              </p>
            </div>
          </button>
          <button onClick={() => startCall('audio')} aria-label="Voice call"
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm">
            <Phone className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => startCall('video')} aria-label="Video call"
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center neumorphic-sm">
            <VideoIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 max-w-lg lg:max-w-3xl mx-auto w-full space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Say hi to start the conversation</p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === user?.id;
          const showSeen = mine && i === lastOwnIdx;
          const hasMedia = !!m.media_url;
          const isOptimistic = m.id.startsWith('tmp-');
          return (
            <SwipeMessage key={m.id} onReply={() => setReplyTo(m)} mine={mine}>
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[78%] rounded-2xl ${hasMedia ? 'p-1' : 'px-3 py-2'} ${
                  mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-card text-foreground rounded-bl-sm neumorphic-sm'
                } ${isOptimistic ? 'opacity-70' : ''}`}>
                  {hasMedia && m.media_type === 'image' && (
                    <div className="relative group">
                      <a href={m.media_url!} target="_blank" rel="noreferrer">
                        <img src={m.media_url!} alt={m.media_name || 'image'} className="rounded-xl max-h-72 object-cover" />
                      </a>
                      <button onClick={(e) => { e.preventDefault(); downloadMedia(m); }}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {hasMedia && m.media_type === 'video' && (
                    <div className="relative">
                      <video src={m.media_url!} controls className="rounded-xl max-h-80 w-full" />
                      <button onClick={() => downloadMedia(m)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center backdrop-blur">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {hasMedia && m.media_type === 'file' && (
                    <button onClick={() => downloadMedia(m)}
                      className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left ${mine ? 'bg-primary-foreground/10' : 'bg-muted'}`}>
                      <FileIcon className="w-5 h-5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{m.media_name}</p>
                        <p className="text-[10px] opacity-70">{formatBytes(m.media_size || 0)}</p>
                      </div>
                      <Download className="w-4 h-4 opacity-70" />
                    </button>
                  )}
                  {m.content && (() => {
                    // Render embedded reply quote on a separate styled block
                    const lines = m.content.split('\n');
                    if (lines[0]?.startsWith('↪ ')) {
                      const quote = lines[0].slice(2);
                      const body = lines.slice(1).join('\n');
                      return (
                        <>
                          <div className={`mb-1 px-2 py-1 rounded-md border-l-2 text-[11px] opacity-80 ${mine ? 'border-primary-foreground/70 bg-primary-foreground/10' : 'border-primary bg-primary/10'}`}>
                            {quote}
                          </div>
                          {body && <p className={`text-sm break-words whitespace-pre-wrap ${hasMedia ? 'px-2 pt-1' : ''}`}>{body}</p>}
                        </>
                      );
                    }
                    return <p className={`text-sm break-words whitespace-pre-wrap ${hasMedia ? 'px-2 pt-1' : ''}`}>{m.content}</p>;
                  })()}
                  <div className={`flex items-center gap-1 justify-end ${hasMedia ? 'px-2 pb-1' : 'mt-1'} ${mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    <span className="text-[9px]">{format(new Date(m.created_at), 'h:mm a')}</span>
                    {mine && (isOptimistic ? <span className="text-[9px]">·</span> : (m.read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />))}
                  </div>
                </div>
                {showSeen && m.read && (
                  <span className="text-[9px] text-muted-foreground mt-0.5 mr-1">Seen</span>
                )}
              </motion.div>
            </SwipeMessage>
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

      {uploading && (
        <div className="px-4 py-2 max-w-lg mx-auto w-full">
          <div className="bg-muted rounded-full px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Uploading…
          </div>
        </div>
      )}

      <div className="sticky bottom-0 glass border-t border-border safe-bottom">
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="px-3 pt-2 max-w-lg lg:max-w-3xl mx-auto"
            >
              <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 border-l-4 border-primary">
                <CornerUpLeft className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-primary">
                    Replying to {replyTo.sender_id === user?.id ? 'yourself' : (other?.full_name || 'them')}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{previewOf(replyTo)}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="w-6 h-6 rounded-full bg-background flex items-center justify-center">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showAttach && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="px-4 py-3 max-w-lg lg:max-w-3xl mx-auto grid grid-cols-3 gap-2"
            >
              <button onClick={() => imgInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-xl bg-muted py-3">
                <ImageIcon className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-medium">Photo</span>
                <span className="text-[9px] text-muted-foreground">≤ {formatBytes(CHAT_MEDIA_LIMITS.image)}</span>
              </button>
              <button onClick={() => videoInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-xl bg-muted py-3">
                <VideoIcon className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-medium">Video</span>
                <span className="text-[9px] text-muted-foreground">≤ {formatBytes(CHAT_MEDIA_LIMITS.video)}</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-xl bg-muted py-3">
                <FileIcon className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-medium">File</span>
                <span className="text-[9px] text-muted-foreground">≤ {formatBytes(CHAT_MEDIA_LIMITS.file)}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-2 px-3 py-3 max-w-lg lg:max-w-3xl mx-auto">
          <button onClick={() => setShowAttach(s => !s)} disabled={uploading}
            className="w-10 h-10 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-foreground">
            {showAttach ? <X className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <Input
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={() => broadcastTyping('stop_typing')}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={replyTo ? 'Type your reply…' : 'Type a message…'}
            className="bg-muted border-0 neumorphic-inset rounded-full"
          />
          <Button onClick={send} disabled={sending || !text.trim()} className="rounded-full bg-primary text-primary-foreground h-10 w-10 p-0 flex-shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <input ref={imgInputRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMedia(f); e.target.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMedia(f); e.target.value = ''; }} />
      <input ref={fileInputRef} type="file" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) sendMedia(f); e.target.value = ''; }} />
    </div>
  );
};

export default ChatThreadPage;
