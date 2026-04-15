import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { usePrayerRequests } from '@/hooks/usePrayerRequests';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/components/AppLayout';
import { HandHeart, Plus, X, Send } from 'lucide-react';

const PrayerPage = () => {
  const { data: prayers, isLoading } = usePrayerRequests();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('prayer_requests').insert({
        user_id: user.id,
        message: message.trim(),
      });
      if (error) throw error;
      setMessage('');
      setShowForm(false);
      toast.success('Prayer request submitted');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const togglePray = async (requestId: string) => {
    if (!user) return;
    const prayer = prayers?.find(p => p.id === requestId);
    const alreadyPrayed = prayer?.prayer_interactions?.some((i: any) => i.user_id === user.id);

    if (alreadyPrayed) {
      await supabase.from('prayer_interactions')
        .delete()
        .eq('prayer_request_id', requestId)
        .eq('user_id', user.id);
    } else {
      await supabase.from('prayer_interactions').insert({
        prayer_request_id: requestId,
        user_id: user.id,
      });
    }
  };

  return (
    <AppLayout>
      <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold font-display text-foreground">Prayer Requests</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
          >
            {showForm ? <X className="w-4 h-4 text-primary-foreground" /> : <Plus className="w-4 h-4 text-primary-foreground" />}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="neumorphic rounded-2xl p-4 bg-card"
            >
              <Textarea
                placeholder="Share your prayer request..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-muted border-0 neumorphic-inset min-h-[100px] resize-none"
              />
              <Button
                onClick={handleSubmit}
                disabled={submitting || !message.trim()}
                className="mt-3 w-full bg-primary text-primary-foreground rounded-xl"
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Request
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="neumorphic rounded-2xl bg-card h-24 animate-pulse" />)}
          </div>
        ) : prayers && prayers.length > 0 ? (
          prayers.map((prayer: any) => (
            <motion.div
              key={prayer.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="neumorphic rounded-2xl p-4 bg-card"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0 overflow-hidden">
                  {prayer.profiles?.profile_image_url ? (
                    <img src={prayer.profiles.profile_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-medium">
                      {prayer.profiles?.full_name?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{prayer.profiles?.full_name || 'Anonymous'}</p>
                  <p className="text-sm text-foreground mt-1">{prayer.message}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(prayer.created_at), 'MMM d · h:mm a')}
                    </span>
                    <button
                      onClick={() => togglePray(prayer.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        prayer.prayer_interactions?.some((i: any) => i.user_id === user?.id)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <HandHeart className="w-3.5 h-3.5" />
                      Pray ({prayer.prayer_interactions?.length || 0})
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-16">
            <HandHeart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No prayer requests yet</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default PrayerPage;
