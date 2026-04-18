import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { usePosts } from '@/hooks/usePosts';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useResources } from '@/hooks/useResources';

import { Cake, FileDown, Link2, ExternalLink } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import YoutubeEmbed from '@/components/YoutubeEmbed';
import VoicePostPlayer from '@/components/VoicePostPlayer';

const PostCard = ({ post }: { post: any }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neumorphic rounded-2xl overflow-hidden bg-card mb-4"
    >
      {post.type === 'image' && post.image_url && (
        <img src={post.image_url} alt={post.caption || ''} className="w-full aspect-video object-cover" loading="lazy" />
      )}
      {post.type === 'youtube' && post.video_url && (
        <YoutubeEmbed url={post.video_url} title={post.caption || 'NSP video'} />
      )}
      {post.type === 'video' && post.video_url && (
        <video src={post.video_url} controls className="w-full aspect-video object-cover" />
      )}
      {post.type === 'voice' && post.video_url && (
        <VoicePostPlayer src={post.video_url} />
      )}
      {post.caption && (
        <div className="p-4">
          <p className="text-foreground text-sm">{post.caption}</p>
          <p className="text-muted-foreground text-xs mt-2">
            {format(new Date(post.created_at), 'MMM d, yyyy · h:mm a')}
          </p>
        </div>
      )}
    </motion.div>
  );
};

const HomePage = () => {
  const { data: posts, isLoading: postsLoading } = usePosts();
  const { data: birthdays } = useBirthdays();
  const { data: resourcesList } = useResources();

  const upcomingBirthdays = birthdays?.slice(0, 3) ?? [];
  const todayBirthdays = birthdays?.filter(b => b.daysUntil === 0) ?? [];

  return (
    <AppLayout>
      <AppHeader title="NSP App" />

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

        {/* Posts Feed */}
        {postsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="neumorphic rounded-2xl bg-card h-64 animate-pulse" />
            ))}
          </div>
        ) : posts && posts.length > 0 ? (
          posts.map(post => <PostCard key={post.id} post={post} />)
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
