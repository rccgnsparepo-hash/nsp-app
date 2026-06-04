import { ReactNode, useMemo } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomTabBar from './BottomTabBar';
import DesktopSidebar from './DesktopSidebar';
import OnboardingTour from './OnboardingTour';
import { useAuth } from '@/contexts/AuthContext';

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const tabs = useMemo(() => [
    '/',
    '/chats',
    ...(isAdmin ? ['/prayer'] : []),
    '/gallery',
    '/profile',
  ], [isAdmin]);

  const idx = tabs.indexOf(pathname);

  const onDragEnd = (_: any, info: PanInfo) => {
    if (idx < 0) return;
    const { offset, velocity } = info;
    const swipe = Math.abs(offset.x) * 0.4 + Math.abs(velocity.x) * 0.2;
    if (swipe < 120) return;
    if (offset.x < 0 && idx < tabs.length - 1) navigate(tabs[idx + 1]);
    else if (offset.x > 0 && idx > 0) navigate(tabs[idx - 1]);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <DesktopSidebar />
      <motion.div
        className="flex-1 min-w-0 pb-20 lg:pb-0"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
      >
        <motion.div
          key={pathname}
          initial={{ opacity: 0, x: 20, rotateY: -2 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
          style={{ transformPerspective: 1000 }}
          className="max-w-lg lg:max-w-3xl xl:max-w-5xl mx-auto"
        >
          {children}
        </motion.div>
      </motion.div>
      <div className="lg:hidden">
        <BottomTabBar />
      </div>
      <OnboardingTour />
    </div>
  );
};

export default AppLayout;
