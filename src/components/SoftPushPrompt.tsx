import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { requestPushPermission, linkUserToPush } from '@/lib/onesignal';

const STORAGE_KEY = 'nsp_push_prompt_dismissed_v2';
const DELAY_MS = 8000;

const SoftPushPrompt = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    const dismissedAt = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < 1000 * 60 * 60 * 24 * 3) return; // 3-day cooldown
    const t = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
  };

  const accept = async () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setOpen(false);
    const granted = await requestPushPermission();
    if (granted && user) await linkUserToPush(user.id, user.email);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          className="fixed bottom-20 left-3 right-3 z-[180] mx-auto max-w-md"
        >
          <div className="relative rounded-2xl bg-card border border-primary/20 p-4 pr-10 backdrop-blur">
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-muted flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Get notified instantly</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  New messages, prayer requests, live events and replies — even when the app is closed.
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="h-8 text-xs" onClick={accept}>Enable</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={dismiss}>Not now</Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SoftPushPrompt;
