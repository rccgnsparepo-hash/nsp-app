import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useResources } from '@/hooks/useResources';
import { useTrendingPosts, useTrendingPrayer, useMemeOfTheDay } from '@/hooks/useTrending';
import { useNews } from '@/hooks/useNews';
import { useAuth } from '@/contexts/AuthContext';
import PostCard from '@/components/PostCard';
import { Cake, FileDown, Link2, ExternalLink, Flame, Sparkles, HandHeart, Newspaper } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { useNavigate } from 'react-router-dom';

const HomePage = () => {
  const [page, setPage] = useState(0);
  const [allPosts, setAllPosts] = useState<any[]>([]);
  const { data: posts, isLoading: postsLoading } = usePosts(page);
  const { data: birthdays } = useBirthdays();
  const { data: resourcesList } = useResources();
  const { data: trending } = useTrendingPosts(3);
  const { data: trendingPrayer } = useTrendingPrayer();
  const { data: memeOfDay } = useMemeOfTheDay();
  const { data: news } = useNews('world');
  const { profile } = useAuth();
  const navigate = useNavigate();
  const loaderRef = useRef<HTMLDivElement>(null);

  // Accumulate posts as pages load
  useEffect(() => {
    if (posts && posts.length > 0) {
      setAllPosts(prev => {
        const ids = new Set(prev.map(p => p.id));
        const newPosts = posts.filter((p: any) => !ids.has(p.id));
        return [...prev, ...newPosts];
      });
    }
  }, [posts]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && posts && posts.length === 10) {
          setPage(p => p + 1);
        }
      },
      { threshold: 0.1 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [posts]);

  const upcomingBirthdays = birthdays?.slice(0, 3) ?? [];
  const todayBirthdays = birthdays?.filter(b => b.daysUntil === 0) ?? [];

  return (
    <AppLayout>
      {/* Header */}
      <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold font-display text-foreground">NSP App</h1>
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center overflow-hidden">
            {profile?.profile_image_url ? (
              <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-primary-foreground text-sm font-bold">
                {profile?.full_name?.[0]?.toUpperCase() || 'N'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Birthday Banner */}
        {todayBirthdays.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-accent rounded-2xl p-4 neumorphic"
          >
            <div className="flex items-center gap-2 mb-2">
              <Cake className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-foreground">🎉 Happy Birthday!</h3>
            </div>
            {todayBirthdays.map(b => (
              <p key={b.id} className="text-sm text-foreground">
                {b.full_name} is celebrating today!
              </p>
            ))}
          </motion.div>
        )}

        {/* Upcoming Birthdays */}
        {upcomingBirthdays.length > 0 && todayBirthdays.length === 0 && (
          <div className="neumorphic-sm rounded-2xl p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <Cake className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Upcoming Birthdays</h3>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {upcomingBirthdays.map(b => (
                <div key={b.id} className="flex flex-col items-center min-w-[60px]">
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden">
                    {b.profile_image_url ? (
                      <img src={b.profile_image_url} alt={b.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-medium">
                        {b.full_name[0]}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-foreground mt-1 text-center truncate w-full">{b.full_name.split(' ')[0]}</span>
                  <span className="text-[10px] text-primary font-medium">
                    {b.daysUntil === 1 ? 'Tomorrow' : `${b.daysUntil}d`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resources Section */}
        {resourcesList && resourcesList.length > 0 && (
          <div className="neumorphic-sm rounded-2xl p-4 bg-card">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileDown className="w-4 h-4 text-primary" />
              Resources & Files
            </h3>
            <div className="space-y-2">
              {resourcesList.slice(0, 5).map((r: any) => (
                <a
                  key={r.id}
                  href={r.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-2 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    r.type === 'pdf' ? 'bg-destructive/10' : 'bg-primary/10'
                  }`}>
                    {r.type === 'pdf' ? <FileDown className="w-4 h-4 text-destructive" /> : <Link2 className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    {r.description && <p className="text-[11px] text-muted-foreground truncate">{r.description}</p>}
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Trending row */}
        {(trending && trending.length > 0) || trendingPrayer || memeOfDay ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 px-1">
              <Flame className="w-4 h-4 text-destructive" /> Trending Now
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {memeOfDay && (
                <button
                  onClick={() => navigate('/memes')}
                  className="neumorphic-sm rounded-2xl overflow-hidden bg-card text-left"
                >
                  <img src={memeOfDay.image_url} alt="" className="w-full h-24 object-cover" loading="lazy" />
                  <div className="p-2">
                    <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Meme of the Day
                    </p>
                    <p className="text-xs text-foreground truncate">{memeOfDay.title || 'Tap to view'}</p>
                  </div>
                </button>
              )}
              {trendingPrayer && (
                <button
                  onClick={() => navigate('/prayer')}
                  className="neumorphic-sm rounded-2xl p-3 bg-card text-left flex flex-col justify-between"
                >
                  <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                    <HandHeart className="w-3 h-3" /> Prayer of the Day
                  </p>
                  <p className="text-xs text-foreground line-clamp-3 mt-1">{trendingPrayer.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{trendingPrayer._amens} Amens</p>
                </button>
              )}
            </div>
            {trending && trending.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {trending.map(t => (
                  <div key={t.id} className="min-w-[140px] neumorphic-sm rounded-2xl p-3 bg-card flex-shrink-0">
                    <p className="text-[10px] font-semibold text-destructive flex items-center gap-1 mb-1">
                      <Flame className="w-3 h-3" /> {t._likes + t._comments} engagements
                    </p>
                    <p className="text-xs text-foreground line-clamp-3">{t.caption || 'Untitled post'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* News strip */}
        {news && news.length > 0 && (
          <button
            onClick={() => navigate('/news')}
            className="w-full neumorphic-sm rounded-2xl p-3 bg-card flex items-center gap-3 text-left"
          >
            {news[0].image_url && (
              <img src={news[0].image_url} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" loading="lazy" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-primary flex items-center gap-1">
                <Newspaper className="w-3 h-3" /> Latest News
              </p>
              <p className="text-xs text-foreground line-clamp-2 mt-0.5">{news[0].title}</p>
            </div>
          </button>
        )}

        {/* Posts Feed */}
        {postsLoading && allPosts.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="neumorphic rounded-2xl bg-card h-64 animate-pulse" />
            ))}
          </div>
        ) : allPosts.length > 0 ? (
          <>
            {allPosts.map(post => <PostCard key={post.id} post={post} />)}
            <div ref={loaderRef} className="h-10 flex items-center justify-center">
              {postsLoading && <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No posts yet</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default HomePage;
