import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import AppLayout from '@/components/AppLayout';
import { Image as ImageIcon, Video, Youtube, Send, X } from 'lucide-react';

const CreatePostPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'youtube' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [preview, setPreview] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !file && !youtubeUrl.trim()) {
      toast.error('Add some content to your post');
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      let imageUrl = null;
      let videoUrl = null;
      const type = mediaType || 'image';

      if (mediaType === 'image' && file) {
        const path = `${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('posts').upload(path, file);
        if (error) throw error;
        imageUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
      } else if (mediaType === 'video' && file) {
        const path = `${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from('posts').upload(path, file);
        if (error) throw error;
        videoUrl = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
      } else if (mediaType === 'youtube') {
        videoUrl = youtubeUrl;
      }

      const { error } = await supabase.from('posts').insert({
        caption: content.trim() || null,
        image_url: imageUrl,
        video_url: videoUrl,
        type: file ? (mediaType || 'image') : youtubeUrl ? 'youtube' : 'image',
        user_id: user.id,
      });
      if (error) throw error;
      toast.success('Post created!');
      navigate('/');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold font-display text-foreground">Create Post</h1>
          <Button onClick={handleSubmit} disabled={loading} size="sm" className="rounded-full px-4">
            <Send className="w-4 h-4 mr-1" />
            {loading ? '...' : 'Post'}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Textarea
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="bg-card border-0 neumorphic min-h-[120px] resize-none text-base"
        />

        {/* Media type selector */}
        <div className="flex gap-3">
          {[
            { type: 'image' as const, icon: ImageIcon, label: 'Photo' },
            { type: 'video' as const, icon: Video, label: 'Video' },
            { type: 'youtube' as const, icon: Youtube, label: 'YouTube' },
          ].map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => { setMediaType(mediaType === type ? null : type); setFile(null); setPreview(''); setYoutubeUrl(''); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                mediaType === type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Media input */}
        {mediaType === 'youtube' ? (
          <Input
            placeholder="Paste YouTube URL..."
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="bg-card border-0 neumorphic"
          />
        ) : mediaType ? (
          <div>
            <Input
              type="file"
              accept={mediaType === 'image' ? 'image/*' : 'video/*'}
              onChange={handleFileChange}
              className="bg-card border-0"
            />
            {preview && mediaType === 'image' && (
              <img src={preview} alt="Preview" className="mt-3 rounded-xl max-h-60 object-cover w-full" />
            )}
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
};

export default CreatePostPage;
