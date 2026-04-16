import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Heart, MessageCircle, Share2, Send, X } from 'lucide-react';
import { usePostLikes, usePostComments } from '@/hooks/usePostInteractions';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const getYoutubeId = (url: string) => {
  const match = url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([^&?#]+)/);
  return match?.[1];
};

const PostCard = ({ post }: { post: any }) => {
  const { user } = useAuth();
  const { isLiked, likeCount, toggleLike } = usePostLikes(post.id);
  const { comments, addComment } = usePostComments(post.id);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection observer for video autoplay
  useEffect(() => {
    if (post.type !== 'video' || !videoRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          videoRef.current?.play().catch(() => {});
        } else {
          videoRef.current?.pause();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(containerRef.current!);
    return () => observer.disconnect();
  }, [post.type]);

  const handleComment = async () => {
    if (!commentText.trim() || !user) return;
    setSubmitting(true);
    try {
      await addComment(commentText.trim(), user.id);
      setCommentText('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.origin;
    if (navigator.share) {
      await navigator.share({ title: post.caption || 'NSP Post', url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="neumorphic rounded-2xl overflow-hidden bg-card mb-4"
    >
      {/* Author header */}
      {post.profiles && (
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
            {post.profiles.profile_image_url ? (
              <img src={post.profiles.profile_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-medium">
                {post.profiles.full_name?.[0] || '?'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{post.profiles.full_name}</p>
            <p className="text-[10px] text-muted-foreground">
              {format(new Date(post.created_at), 'MMM d, yyyy · h:mm a')}
            </p>
          </div>
        </div>
      )}

      {/* Media */}
      {post.type === 'image' && post.image_url && (
        <img src={post.image_url} alt={post.caption || ''} className="w-full aspect-video object-cover" loading="lazy" />
      )}
      {post.type === 'youtube' && post.video_url && (() => {
        const videoId = getYoutubeId(post.video_url);
        return videoId ? (
          <div className="aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <a href={post.video_url} target="_blank" rel="noopener noreferrer" className="block p-4 text-primary text-sm">
            ▶ Watch on YouTube
          </a>
        );
      })()}
      {post.type === 'video' && post.video_url && (
        <video ref={videoRef} src={post.video_url} controls muted playsInline className="w-full aspect-video object-cover" preload="metadata" />
      )}

      {/* Caption + interactions */}
      <div className="p-4 space-y-3">
        {post.caption && <p className="text-foreground text-sm">{post.caption}</p>}
        {!post.profiles && post.created_at && (
          <p className="text-muted-foreground text-xs">
            {format(new Date(post.created_at), 'MMM d, yyyy · h:mm a')}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-6 pt-1">
          <button onClick={toggleLike} className="flex items-center gap-1.5 group">
            <Heart className={`w-5 h-5 transition-all ${isLiked ? 'fill-destructive text-destructive scale-110' : 'text-muted-foreground group-hover:text-destructive'}`} />
            <span className={`text-xs font-medium ${isLiked ? 'text-destructive' : 'text-muted-foreground'}`}>{likeCount || ''}</span>
          </button>
          <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5 group">
            <MessageCircle className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs font-medium text-muted-foreground">{comments.length || ''}</span>
          </button>
          <button onClick={handleShare} className="group">
            <Share2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        </div>

        {/* Comments section */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border pt-3 space-y-3">
                {comments.slice(0, 5).map((c: any) => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-muted flex-shrink-0 overflow-hidden">
                      {c.profiles?.profile_image_url ? (
                        <img src={c.profiles.profile_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                          {c.profiles?.full_name?.[0] || '?'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 bg-muted/50 rounded-xl px-3 py-2">
                      <p className="text-xs font-semibold text-foreground">{c.profiles?.full_name}</p>
                      <p className="text-xs text-foreground">{c.content}</p>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                    placeholder="Write a comment..."
                    className="flex-1 text-sm bg-muted/50 rounded-full px-4 py-2 outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  <button onClick={handleComment} disabled={submitting || !commentText.trim()} className="w-8 h-8 rounded-full bg-primary flex items-center justify-center disabled:opacity-50">
                    <Send className="w-3.5 h-3.5 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default PostCard;
