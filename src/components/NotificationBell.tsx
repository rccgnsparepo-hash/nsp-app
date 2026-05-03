import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

const NotificationBell = () => {
  const { count, markAllRead } = useRealtimeNotifications();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => { markAllRead(); navigate('/inbox'); }}
      className="relative w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm"
      aria-label="Notifications"
    >
      <Bell className="w-4 h-4 text-foreground" />
      {count > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center"
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </button>
  );
};

export default NotificationBell;
