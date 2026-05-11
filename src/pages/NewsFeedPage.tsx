import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Newspaper, RefreshCw, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

const NewsFeedPage = () => {
  const navigate = useNavigate();
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['faith-news'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('fetch-faith-news');
      return (data as any)?.articles ?? [];
    },
  });

  const open = (url: string) =>
    navigate(`/read?url=${encodeURIComponent(url)}`);

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 glass border-b border-border safe-top">
        <div className="flex items-center gap-3 px-4 h-14 max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Newspaper className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold flex-1">Trending in Faith</p>
          <Button size="icon" variant="ghost" onClick={() => refetch()} disabled={isFetching} className="h-8 w-8">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {!data && <p className="text-center text-muted-foreground text-sm py-10">Loading news…</p>}
        {data?.length === 0 && <p className="text-center text-muted-foreground text-sm py-10">No articles yet.</p>}
        {data?.map((a: any) => (
          <motion.button
            key={a.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => open(a.url)}
            className="neumorphic rounded-2xl bg-card overflow-hidden text-left w-full"
          >
            {a.image_url && (
              <img src={a.image_url} alt="" className="w-full h-40 object-cover" loading="lazy"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            )}
            <div className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">{a.source}</p>
              <p className="text-sm font-semibold text-foreground mt-1 line-clamp-2">{a.title}</p>
              {a.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>}
              {a.published_at && (
                <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />{formatDistanceToNow(new Date(a.published_at), { addSuffix: true })}
                </p>
              )}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default NewsFeedPage;
