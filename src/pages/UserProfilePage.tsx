import { useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, Calendar, Cake, MapPin } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ['public-profile', userId],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const { data: stats } = useQuery({
    queryKey: ['public-stats', userId],
    queryFn: async () => {
      const { data } = await supabase.from('user_stats').select('*').eq('user_id', userId!).maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const { data: badges } = useQuery({
    queryKey: ['public-badges', userId],
    queryFn: async () => {
      const { data } = await supabase.from('user_badges').select('*').eq('user_id', userId!);
      return data ?? [];
    },
    enabled: !!userId,
  });

  // Attendance: pull this user's records and join session dates
  const { data: attendance } = useQuery({
    queryKey: ['public-attendance', userId],
    queryFn: async () => {
      const { data: recs } = await supabase.from('attendance_records').select('*').eq('user_id', userId!);
      if (!recs?.length) return [];
      const ids = recs.map(r => r.session_id);
      const { data: sess } = await supabase.from('attendance_sessions').select('*').in('id', ids);
      const sMap = new Map((sess ?? []).map(s => [s.id, s]));
      return recs.map(r => ({ ...r, session: sMap.get(r.session_id) }));
    },
    enabled: !!userId,
  });

  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [today.getMonth()]);

  const statusForDay = (day: Date) => {
    if (!attendance) return null;
    const rec = attendance.find(a => a.session?.session_date && isSameDay(parseISO(a.session.session_date), day));
    return rec?.status ?? null;
  };

  const attended = (attendance ?? []).filter(a => a.status === 'approved');
  const isOwn = user?.id === userId;

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 glass border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <p className="text-sm font-semibold">Profile</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="neumorphic rounded-3xl p-5 bg-card text-center">
          <div className="w-24 h-24 mx-auto rounded-full bg-muted overflow-hidden mb-3">
            {profile?.profile_image_url ?
              <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                {profile?.full_name?.[0]?.toUpperCase()}
              </div>}
          </div>
          <h1 className="text-xl font-bold text-foreground">{profile?.full_name ?? 'Loading…'}</h1>
          {profile?.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
          {profile?.date_of_birth && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Cake className="w-3 h-3" />{format(parseISO(profile.date_of_birth), 'MMMM d')}
            </p>
          )}
          {!isOwn && user && (
            <Button asChild className="mt-4 rounded-full bg-primary text-primary-foreground">
              <Link to={`/chat/${userId}`}><MessageCircle className="w-4 h-4 mr-1" />Send Message</Link>
            </Button>
          )}
        </motion.div>

        <div className="grid grid-cols-3 gap-2">
          <div className="neumorphic-sm rounded-2xl p-3 bg-card text-center">
            <p className="text-lg font-bold text-foreground">{stats?.points ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Points</p>
          </div>
          <div className="neumorphic-sm rounded-2xl p-3 bg-card text-center">
            <p className="text-lg font-bold text-foreground">{stats?.login_streak ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Day Streak</p>
          </div>
          <div className="neumorphic-sm rounded-2xl p-3 bg-card text-center">
            <p className="text-lg font-bold text-foreground">{badges?.length ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Badges</p>
          </div>
        </div>

        <div className="neumorphic rounded-2xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Attendance · {format(today, 'MMMM yyyy')}</h3>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="text-[9px] text-muted-foreground font-medium">{d}</div>
            ))}
            {Array.from({ length: monthStart.getDay() }).map((_, i) => <div key={`p${i}`} />)}
            {days.map(d => {
              const st = statusForDay(d);
              const cls = st === 'approved' ? 'bg-green-500/80 text-white' :
                          st === 'pending' ? 'bg-yellow-500/80 text-white' :
                          st === 'rejected' ? 'bg-destructive/70 text-white' :
                          'bg-muted text-muted-foreground';
              return (
                <div key={d.toISOString()}
                  className={`aspect-square rounded-md text-[10px] flex items-center justify-center ${cls}`}>
                  {d.getDate()}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500/80" />Present</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-yellow-500/80" />Pending</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-destructive/70" />Rejected</span>
          </div>
        </div>

        <div className="neumorphic rounded-2xl p-4 bg-card">
          <h3 className="text-sm font-semibold mb-3">Services attended ({attended.length})</h3>
          {attended.length === 0 ? (
            <p className="text-xs text-muted-foreground">No approved attendance yet.</p>
          ) : (
            <div className="space-y-1.5">
              {attended.slice(0, 12).map(a => (
                <div key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate">{a.session?.title}</span>
                  <span className="text-muted-foreground flex items-center gap-1 flex-shrink-0">
                    {a.session?.location && <><MapPin className="w-2.5 h-2.5" />{a.session.location} ·</>}
                    {a.session?.session_date && format(parseISO(a.session.session_date), 'MMM d')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;
