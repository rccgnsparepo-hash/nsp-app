import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, HandHeart, Image as ImageIcon, User, MessageCircle, Settings, LayoutDashboard, Newspaper } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DesktopSidebar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();
  const items = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/chats', icon: MessageCircle, label: 'Chats' },
    ...(isAdmin ? [{ path: '/prayer', icon: HandHeart, label: 'Prayer' }] : []),
    { path: '/gallery', icon: ImageIcon, label: 'Gallery' },
    { path: '/news', icon: Newspaper, label: 'News' },
    { path: '/profile', icon: User, label: 'Profile' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];
  const all = isAdmin ? [...items, { path: '/admin', icon: LayoutDashboard, label: 'Admin' }] : items;

  return (
    <aside className="hidden lg:flex flex-col w-20 xl:w-64 h-screen sticky top-0 border-r border-border bg-card/60 backdrop-blur">
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold">N</div>
        <p className="hidden xl:block font-semibold text-foreground truncate">{profile?.full_name || 'NSP'}</p>
      </div>
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto no-scrollbar">
        {all.map((it) => {
          const active = pathname === it.path || (it.path !== '/' && pathname.startsWith(it.path));
          return (
            <button
              key={it.path}
              onClick={() => navigate(it.path)}
              className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/60 transition-colors"
            >
              {active && (
                <motion.div layoutId="desktop-active" className="absolute inset-0 rounded-xl bg-primary/10" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              )}
              <it.icon className={`relative w-5 h-5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`relative hidden xl:inline text-sm font-medium ${active ? 'text-primary' : 'text-foreground'}`}>{it.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default DesktopSidebar;
