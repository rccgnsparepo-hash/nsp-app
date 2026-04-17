import { useState } from 'react';
import { useNews } from '@/hooks/useNews';
import { ExternalLink, Newspaper } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { motion } from 'framer-motion';

const CATEGORIES = [
  { id: 'world', label: 'World' },
  { id: 'tech', label: 'Tech' },
  { id: 'faith', label: 'Faith' },
];

const NewsPage = () => {
  const [category, setCategory] = useState('world');
  const { data: news, isLoading } = useNews(category);

  return (
    <AppLayout>
      <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Newspaper className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold font-display text-foreground">News</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                category === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isLoading && !news?.length ? (
          [1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl bg-card animate-pulse" />)
        ) : (news?.length ?? 0) === 0 ? (
          <p className="text-center text-muted-foreground py-12">No news available</p>
        ) : (
          news?.map((n, i) => (
            <motion.a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="block neumorphic rounded-2xl bg-card overflow-hidden"
            >
              {n.image_url && (
                <img src={n.image_url} alt="" className="w-full h-40 object-cover" loading="lazy" />
              )}
              <div className="p-3">
                <h3 className="font-semibold text-foreground text-sm line-clamp-2">{n.title}</h3>
                {n.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.description}</p>
                )}
                <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                  <span>{n.source}</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            </motion.a>
          ))
        )}
      </div>
    </AppLayout>
  );
};

export default NewsPage;
