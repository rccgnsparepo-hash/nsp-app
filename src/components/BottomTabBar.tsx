import { useLocation, useNavigate } from 'react-router-dom';
import { Home, HandHeart, Image, User, LayoutDashboard, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const tabs = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/chats', icon: MessageCircle, label: 'Chats' },
    ...(isAdmin ? [{ path: '/prayer', icon: HandHeart, label: 'Prayer' }] : []),
    { path: '/gallery', icon: Image, label: 'Gallery' },
    { path: '/profile', icon: User, label: 'Profile' },
    ...(isAdmin ? [{ path: '/admin', icon: LayoutDashboard, label: 'Admin' }] : []),
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <motion.button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              whileTap={{ scale: 0.85, rotateX: 12 }}
              whileHover={{ y: -2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="relative flex flex-col items-center justify-center w-16 h-full"
              style={{ transformPerspective: 600 }}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-0.5 w-8 h-1 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-[10px] mt-0.5 font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomTabBar;
