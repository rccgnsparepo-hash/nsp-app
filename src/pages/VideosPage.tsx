import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Share2, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePostLikes } from '@/hooks/usePostInteractions';
import { toast } from 'sonner';
import BottomTabBar from '@/components/BottomTabBar';

const getYoutubeId = (url: string) => {
  const m = url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([^&?#]+)/);
  return m?.[1];
};

const VideoItem = ({ post, isActive, muted, toggleMute }: any) => {
  const { isLiked, likeCount, toggleLike } = usePostLikes(post.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytId = post.type === 'youtube' ? getYoutubeId(post.video_url) : null;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.muted = muted;
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [isActive, muted]);

  const handleShare = async () => {
    const url = window.location.origin;
    if (navigator.share) await navigator.share({ title: post.caption || 'NSP', url });
    else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
  };

  return (
    <div className="relative h-[100dvh] w-full snap-start snap-always bg-black flex items-center justify-center overflow-hidden">
      {post.type === 'video' && post.video_url && (
        <video
          ref={videoRef}
          src={post.video_url}
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          onClick={toggleMute}
        />
      )}
      {ytId && isActive && (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${ytId}&controls=0&modestbranding=1&playsinline=1`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* Mute toggle */}
      {post.type === 'video' && (
        <button
          onClick={toggleMute}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center z-10"
        >
          {muted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
        </button>
      )}

      {/* Right-side actions */}
      <div className="absolute right-3 bottom-32 flex flex-col gap-5 z-10">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
          </div>
          <span className="text-white text-xs font-semibold">{likeCount || 0}</span>
        </button>
        <button onClick={handleShare} className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-white text-xs font-semibold">Share</span>
        </button>
      </div>

      {/* Caption + author */}
      <div className="absolute left-0 right-16 bottom-24 px-4 z-10">
        {post.profiles && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-white/20 overflow-hidden border-2 border-white">
              {post.profiles.profile_image_url ? (
                <img src={post.profiles.profile_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                  {post.profiles.full_name?.[0]}
                </div>
              )}
            </div>
            <span className="text-white font-semibold text-sm drop-shadow">{post.profiles.full_name}</span>
          </div>
        )}
        {post.caption && <p className="text-white text-sm drop-shadow line-clamp-3">{post.caption}</p>}
      </div>
    </div>
  );
};

const VideosPage = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('posts')
        .select('*, profiles:user_id(full_name, profile_image_url)')
        .or('type.eq.video,type.eq.youtube')
        .order('created_at', { ascending: false })
        .limit(50);
      setPosts(data ?? []);
    })();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / window.innerHeight);
      setActiveIdx(idx);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black">
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {posts.length === 0 ? (
          <div className="h-[100dvh] flex items-center justify-center text-white/70">
            No videos yet. Create one!
          </div>
        ) : (
          posts.map((p, i) => (
            <VideoItem
              key={p.id}
              post={p}
              isActive={i === activeIdx}
              muted={muted}
              toggleMute={() => setMuted(m => !m)}
            />
          ))
        )}
      </div>
      <BottomTabBar />
    </div>
  );
};

export default VideosPage;
