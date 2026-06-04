import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, MessageCircle, Image as ImageIcon, User, ChevronRight, Sparkles, Hand } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const steps = [
  { icon: Sparkles, title: 'Welcome to NSP', body: 'A space to grow, connect, and stay in sync with your community.' },
  { icon: Home, title: 'Home feed', body: 'Catch up on posts, voice notes, birthdays, and resources from your community.' },
  { icon: MessageCircle, title: 'Chats & Calls', body: 'Direct messages with swipe-to-reply, plus crystal-clear voice/video calls.' },
  { icon: Hand, title: 'Swipe to navigate', body: 'Swipe left or right anywhere to move between tabs — just like Snapchat.' },
  { icon: ImageIcon, title: 'Gallery & News', body: 'Browse community photos and faith-focused news from the sidebar.' },
  { icon: User, title: 'Make it yours', body: 'Visit Profile & Settings to set your theme, avatar, and notifications.' },
];

const OnboardingTour = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!user || !profile) return;
    if ((profile as any).tour_completed) return;
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [user, profile]);

  const finish = async () => {
    setOpen(false);
    if (!user) return;
    try {
      await supabase.from('profiles').update({ tour_completed: true } as any).eq('id', user.id);
      await refreshProfile();
    } catch {}
  };

  if (!open) return null;
  const current = steps[step];
  const Icon = current.icon;
  const last = step === steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        onClick={finish}
      >
        <motion.div
          key={step}
          initial={{ y: 60, opacity: 0, rotateX: -10 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          exit={{ y: -30, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          style={{ transformPerspective: 800 }}
          className="w-full max-w-sm rounded-3xl bg-card p-6 border border-border"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
              <Icon className="w-6 h-6" />
            </div>
            <span className="text-xs text-muted-foreground">{step + 1} / {steps.length}</span>
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-1">{current.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>

          <div className="flex items-center gap-1.5 my-5">
            {steps.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-2 bg-muted'}`} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button onClick={finish} className="text-xs text-muted-foreground font-medium">Skip</button>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              {last ? 'Get started' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OnboardingTour;
