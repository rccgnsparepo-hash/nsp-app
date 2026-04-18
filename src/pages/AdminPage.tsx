import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import VoiceRecorder from '@/components/VoiceRecorder';
import { useBirthdays } from '@/hooks/useBirthdays';
import { Upload, Trash2, Users, FileText, Image as ImageIcon, Cake, Link2, FileDown, Mic } from 'lucide-react';
import { extractYoutubeId } from '@/lib/youtube';

const AdminPage = () => {
  const { isAdmin } = useAuth();
  const { data: birthdays } = useBirthdays();

  // Users
  const { data: users, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Resources
  const { data: resources, refetch: refetchResources } = useQuery({
    queryKey: ['admin-resources'],
    queryFn: async () => {
      const { data, error } = await supabase.from('resources').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  // Create Post (supports bulk image/video uploads — 1 row per file)
  const [postCaption, setPostCaption] = useState('');
  const [postType, setPostType] = useState<'image' | 'youtube' | 'video'>('image');
  const [postFiles, setPostFiles] = useState<FileList | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [postLoading, setPostLoading] = useState(false);

  const handleCreatePost = async () => {
    setPostLoading(true);
    try {
      if (postType === 'youtube') {
        if (!extractYoutubeId(youtubeUrl)) {
          toast.error('Invalid YouTube link. Use a watch, youtu.be, embed or shorts URL.');
          return;
        }
        const { error } = await supabase.from('posts').insert({
          caption: postCaption || null,
          video_url: youtubeUrl.trim(),
          type: 'youtube',
        });
        if (error) throw error;
      } else {
        if (!postFiles || postFiles.length === 0) {
          toast.error('Please choose at least one file');
          return;
        }
        const bucket = 'posts';
        let uploaded = 0;
        for (let i = 0; i < postFiles.length; i++) {
          const file = postFiles[i];
          const path = `${Date.now()}-${i}-${file.name}`;
          const { error: upErr } = await supabase.storage.from(bucket).upload(path, file);
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
          const { error } = await supabase.from('posts').insert({
            caption: postCaption || null,
            image_url: postType === 'image' ? publicUrl : null,
            video_url: postType === 'video' ? publicUrl : null,
            type: postType,
          });
          if (error) throw error;
          uploaded++;
        }
        toast.success(`${uploaded} ${postType}${uploaded > 1 ? 's' : ''} posted`);
      }
      setPostCaption('');
      setPostFiles(null);
      setYoutubeUrl('');
      if (postType === 'youtube') toast.success('Post created!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPostLoading(false);
    }
  };

  // Voice Note upload (record or upload audio file)
  const [vnCaption, setVnCaption] = useState('');
  const [vnFile, setVnFile] = useState<File | null>(null);
  const [vnLoading, setVnLoading] = useState(false);

  const handleCreateVoiceNote = async () => {
    if (!vnFile) { toast.error('Please record or choose an audio file'); return; }
    setVnLoading(true);
    try {
      const path = `${Date.now()}-${vnFile.name}`;
      const { error: upErr } = await supabase.storage.from('voicenotes').upload(path, vnFile, {
        contentType: vnFile.type || 'audio/webm',
      });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('voicenotes').getPublicUrl(path);
      const { error } = await supabase.from('posts').insert({
        caption: vnCaption || null,
        video_url: publicUrl,
        type: 'voice',
      });
      if (error) throw error;
      setVnCaption('');
      setVnFile(null);
      toast.success('Voice note posted!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVnLoading(false);
    }
  };

  // Gallery Upload
  const [galleryFiles, setGalleryFiles] = useState<FileList | null>(null);
  const [galleryCaption, setGalleryCaption] = useState('');
  const [galleryLoading, setGalleryLoading] = useState(false);

  const handleGalleryUpload = async () => {
    if (!galleryFiles) return;
    setGalleryLoading(true);
    try {
      for (let i = 0; i < galleryFiles.length; i++) {
        const file = galleryFiles[i];
        const path = `${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from('gallery').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(path);
        const { error } = await supabase.from('gallery').insert({
          image_url: publicUrl,
          caption: galleryCaption,
        });
        if (error) throw error;
      }
      setGalleryFiles(null);
      setGalleryCaption('');
      toast.success('Gallery images uploaded!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGalleryLoading(false);
    }
  };

  // Resource upload
  const [resTitle, setResTitle] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [resType, setResType] = useState<'pdf' | 'link'>('pdf');
  const [resFile, setResFile] = useState<File | null>(null);
  const [resLink, setResLink] = useState('');
  const [resLoading, setResLoading] = useState(false);

  const handleResourceUpload = async () => {
    if (!resTitle.trim()) { toast.error('Title is required'); return; }
    setResLoading(true);
    try {
      let fileUrl = '';
      if (resType === 'pdf' && resFile) {
        const path = `${Date.now()}-${resFile.name}`;
        const { error } = await supabase.storage.from('resources').upload(path, resFile);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('resources').getPublicUrl(path);
        fileUrl = publicUrl;
      } else if (resType === 'link') {
        if (!resLink.trim()) { toast.error('URL is required'); setResLoading(false); return; }
        fileUrl = resLink;
      } else {
        toast.error('Please select a PDF file'); setResLoading(false); return;
      }

      const { error } = await supabase.from('resources').insert({
        title: resTitle,
        description: resDesc || null,
        file_url: fileUrl,
        type: resType,
      });
      if (error) throw error;
      setResTitle('');
      setResDesc('');
      setResFile(null);
      setResLink('');
      refetchResources();
      toast.success('Resource uploaded!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResLoading(false);
    }
  };

  const handleDeleteResource = async (id: string) => {
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Resource deleted'); refetchResources(); }
  };

  const handleDeleteUser = async (userId: string) => {
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) toast.error(error.message);
    else { toast.success('User removed'); refetchUsers(); }
  };

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">Access denied</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <AppHeader title="Admin Dashboard" />

      <div className="p-4">
        <Tabs defaultValue="posts" className="w-full">
          <TabsList className="w-full bg-muted rounded-xl grid grid-cols-6 h-10">
            <TabsTrigger value="posts" className="rounded-lg text-[10px] data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <FileText className="w-3.5 h-3.5 mr-0.5" />Posts
            </TabsTrigger>
            <TabsTrigger value="vn" className="rounded-lg text-[10px] data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Mic className="w-3.5 h-3.5 mr-0.5" />Vn
            </TabsTrigger>
            <TabsTrigger value="gallery" className="rounded-lg text-[10px] data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <ImageIcon className="w-3.5 h-3.5 mr-0.5" />Gallery
            </TabsTrigger>
            <TabsTrigger value="resources" className="rounded-lg text-[10px] data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <FileDown className="w-3.5 h-3.5 mr-0.5" />Files
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-lg text-[10px] data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Users className="w-3.5 h-3.5 mr-0.5" />Users
            </TabsTrigger>
            <TabsTrigger value="birthdays" className="rounded-lg text-[10px] data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Cake className="w-3.5 h-3.5 mr-0.5" />B-day
            </TabsTrigger>
          </TabsList>

          {/* Create Post — supports BULK image/video uploads */}
          <TabsContent value="posts" className="mt-4 space-y-4">
            <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
              <h3 className="font-semibold text-foreground">Create Post</h3>
              <div className="flex gap-2">
                {(['image', 'youtube', 'video'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setPostType(t); setPostFiles(null); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      postType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Caption (shared across all uploads)..."
                value={postCaption}
                onChange={(e) => setPostCaption(e.target.value)}
                className="bg-muted border-0 neumorphic-inset resize-none"
              />
              {postType === 'youtube' ? (
                <Input
                  placeholder="YouTube URL"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="bg-muted border-0 neumorphic-inset"
                />
              ) : (
                <>
                  <Input
                    type="file"
                    multiple
                    accept={postType === 'image' ? 'image/*' : 'video/*'}
                    onChange={(e) => setPostFiles(e.target.files)}
                    className="bg-muted border-0"
                  />
                  {postFiles && postFiles.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {postFiles.length} file{postFiles.length > 1 ? 's' : ''} selected — each will be posted as its own item.
                    </p>
                  )}
                </>
              )}
              <Button onClick={handleCreatePost} disabled={postLoading} className="w-full bg-primary text-primary-foreground rounded-xl">
                <Upload className="w-4 h-4 mr-2" />{postLoading ? 'Uploading...' : 'Create Post'}
              </Button>
            </div>
          </TabsContent>

          {/* Voice Notes */}
          <TabsContent value="vn" className="mt-4 space-y-4">
            <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary" />Post a Voice Note
              </h3>
              <p className="text-xs text-muted-foreground">Record from your microphone or upload an audio file.</p>
              <VoiceRecorder
                onRecorded={setVnFile}
                recordedFile={vnFile}
                onClear={() => setVnFile(null)}
              />
              <div className="text-xs text-muted-foreground text-center">— or —</div>
              <Input
                type="file"
                accept="audio/*"
                onChange={(e) => setVnFile(e.target.files?.[0] || null)}
                className="bg-muted border-0"
              />
              <Textarea
                placeholder="Caption (optional)..."
                value={vnCaption}
                onChange={(e) => setVnCaption(e.target.value)}
                className="bg-muted border-0 neumorphic-inset resize-none"
              />
              <Button onClick={handleCreateVoiceNote} disabled={vnLoading || !vnFile} className="w-full bg-primary text-primary-foreground rounded-xl">
                <Upload className="w-4 h-4 mr-2" />{vnLoading ? 'Posting...' : 'Post Voice Note'}
              </Button>
            </div>
          </TabsContent>

          {/* Gallery Upload */}
          <TabsContent value="gallery" className="mt-4 space-y-4">
            <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
              <h3 className="font-semibold text-foreground">Upload to Gallery</h3>
              <Input type="file" accept="image/*" multiple onChange={(e) => setGalleryFiles(e.target.files)} className="bg-muted border-0" />
              <Input placeholder="Caption (optional)" value={galleryCaption} onChange={(e) => setGalleryCaption(e.target.value)} className="bg-muted border-0 neumorphic-inset" />
              <Button onClick={handleGalleryUpload} disabled={galleryLoading || !galleryFiles} className="w-full bg-primary text-primary-foreground rounded-xl">
                <Upload className="w-4 h-4 mr-2" />{galleryLoading ? 'Uploading...' : 'Upload Images'}
              </Button>
            </div>
          </TabsContent>

          {/* Resources (PDFs & Links) */}
          <TabsContent value="resources" className="mt-4 space-y-4">
            <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
              <h3 className="font-semibold text-foreground">Upload Resource</h3>
              <div className="flex gap-2">
                {(['pdf', 'link'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setResType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      resType === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t === 'pdf' ? 'PDF File' : 'Link'}
                  </button>
                ))}
              </div>
              <Input placeholder="Title" value={resTitle} onChange={(e) => setResTitle(e.target.value)} className="bg-muted border-0 neumorphic-inset" />
              <Input placeholder="Description (optional)" value={resDesc} onChange={(e) => setResDesc(e.target.value)} className="bg-muted border-0 neumorphic-inset" />
              {resType === 'pdf' ? (
                <Input type="file" accept=".pdf" onChange={(e) => setResFile(e.target.files?.[0] || null)} className="bg-muted border-0" />
              ) : (
                <Input placeholder="https://..." value={resLink} onChange={(e) => setResLink(e.target.value)} className="bg-muted border-0 neumorphic-inset" />
              )}
              <Button onClick={handleResourceUpload} disabled={resLoading} className="w-full bg-primary text-primary-foreground rounded-xl">
                <Upload className="w-4 h-4 mr-2" />{resLoading ? 'Uploading...' : 'Upload Resource'}
              </Button>
            </div>

            {/* Existing resources */}
            {resources && resources.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground px-1">Uploaded Resources</h4>
                {resources.map((r: any) => (
                  <div key={r.id} className="neumorphic-sm rounded-2xl p-3 bg-card flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      r.type === 'pdf' ? 'bg-destructive/10' : 'bg-primary/10'
                    }`}>
                      {r.type === 'pdf' ? (
                        <FileDown className="w-5 h-5 text-destructive" />
                      ) : (
                        <Link2 className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                      {r.description && <p className="text-xs text-muted-foreground truncate">{r.description}</p>}
                    </div>
                    <button onClick={() => handleDeleteResource(r.id)} className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Users */}
          <TabsContent value="users" className="mt-4 space-y-3">
            {users?.map(u => (
              <div key={u.id} className="neumorphic-sm rounded-2xl p-3 bg-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {u.profile_image_url ? (
                    <img src={u.profile_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">{u.full_name?.[0] || '?'}</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <button onClick={() => handleDeleteUser(u.id)} className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </TabsContent>

          {/* Birthdays */}
          <TabsContent value="birthdays" className="mt-4 space-y-3">
            {birthdays?.map(b => (
              <div key={b.id} className="neumorphic-sm rounded-2xl p-3 bg-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex-shrink-0">
                  {b.profile_image_url ? (
                    <img src={b.profile_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">{b.full_name?.[0]}</div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{b.full_name}</p>
                  <p className="text-xs text-muted-foreground">{b.date_of_birth}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  b.daysUntil === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {b.daysUntil === 0 ? 'Today! 🎂' : `${b.daysUntil}d`}
                </span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default AdminPage;
