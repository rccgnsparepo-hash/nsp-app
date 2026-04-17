import { useMemes } from '@/hooks/useNews';
import { Laugh } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { motion } from 'framer-motion';

const MemesPage = () => {
  const { data: memes, isLoading } = useMemes();

  return (
    <AppLayout>
      <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border flex items-center gap-2">
        <Laugh className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold font-display text-foreground">Memes</h1>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2">
        {isLoading
          ? [1, 2, 3, 4].map(i => <div key={i} className="aspect-square rounded-xl bg-card animate-pulse" />)
          : memes?.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02 }}
                className="rounded-xl overflow-hidden bg-card neumorphic-sm"
              >
                <img src={m.image_url} alt={m.title} className="w-full h-auto" loading="lazy" />
                {m.title && <p className="text-[10px] p-1.5 text-muted-foreground truncate">{m.title}</p>}
              </motion.div>
            ))}
      </div>
    </AppLayout>
  );
};

export default MemesPage;
