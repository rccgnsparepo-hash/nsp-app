import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import logo from '@/assets/rccg-nsp-logo.jpg';

const DURATION_MS = 6000;

const SplashScreen = ({ onDone }: { onDone: () => void }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      // small delay to allow exit animation
      setTimeout(onDone, 450);
    }, DURATION_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black"
        >
          {/* glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 0.45, scale: 1.2 }}
            transition={{ duration: 2.4, repeat: Infinity, repeatType: 'reverse' }}
            className="absolute w-[360px] h-[360px] rounded-full bg-primary/30 blur-3xl"
          />
          <motion.img
            src={logo}
            alt="RCCG NSP"
            initial={{ opacity: 0, scale: 0.7, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.15 }}
            className="relative w-56 h-56 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.25)]"
          />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="mt-8 text-center"
          >
            <p className="text-white/90 text-sm tracking-[0.3em] uppercase">Welcome to</p>
            <p className="text-white text-2xl font-bold font-display mt-1">RCCG N.S.P</p>
          </motion.div>
          {/* progress bar */}
          <div className="absolute bottom-16 w-48 h-1 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: DURATION_MS / 1000, ease: 'linear' }}
              className="h-full bg-white"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
