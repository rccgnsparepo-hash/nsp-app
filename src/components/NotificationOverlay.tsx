import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

const NotificationOverlay = () => {
  const { current, dismissCurrent } = useRealtimeNotifications();

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: -40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[94vw] max-w-md"
        >
          <div className="relative neumorphic rounded-2xl bg-card border border-primary/20 p-4 pr-10 shadow-2xl">
            <button
              onClick={dismissCurrent}
              aria-label="Dismiss notification"
              className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70"
            >
              <X className="w-3.5 h-3.5 text-foreground" />
            </button>
            <p className="text-base font-bold text-foreground leading-snug">{current.title}</p>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{current.body}</p>
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5, ease: 'linear' }}
              style={{ transformOrigin: 'left' }}
              className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-b-2xl"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationOverlay;
