import { ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { useAuth } from '@/contexts/AuthContext';

interface AppHeaderProps {
  title: string;
  right?: ReactNode;
}

const AppHeader = ({ title, right }: AppHeaderProps) => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold font-display text-foreground truncate">{title}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {right}
          <NotificationBell />
          <button
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center transition-colors"
          >
            <Settings className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={() => navigate('/profile')}
            aria-label="Profile"
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
          >
            <span className="text-primary-foreground text-sm font-bold">
              {profile?.full_name?.[0]?.toUpperCase() || 'N'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppHeader;
