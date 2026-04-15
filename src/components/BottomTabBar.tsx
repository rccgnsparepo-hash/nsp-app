import { useLocation, useNavigate } from 'react-router-dom';
import { Home, HandHeart, Image, User, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

const tabs = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/prayer', icon: HandHeart, label: 'Prayer' },
  { path: '/gallery', icon: Image, label: 'Gallery' },
  { path: '/profile', icon: User, label: 'Profile' },
];

const adminTab = { path: '/admin', icon: LayoutDashboard, label: 'Admin' };

const BottomTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const allTabs = isAdmin ? [...tabs, adminTab] : tabs;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {allTabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="relative flex flex-col items-center justify-center w-16 h-full"
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-0.5 w-8 h-1 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon
                className={`w-5 h-5 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-[10px] mt-0.5 font-medium transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomTabBar;
