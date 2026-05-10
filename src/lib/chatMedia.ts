import { supabase } from '@/integrations/supabase/client';

export const CHAT_MEDIA_LIMITS = {
  image: 25 * 1024 * 1024,   // 25 MB
  video: 200 * 1024 * 1024,  // 200 MB
  file: 100 * 1024 * 1024,   // 100 MB
} as const;

export type ChatMediaKind = 'image' | 'video' | 'file';

export const detectKind = (file: File): ChatMediaKind => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
};

export const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export interface UploadedMedia {
  media_url: string;
  media_type: ChatMediaKind;
  media_name: string;
  media_size: number;
  media_mime: string;
}

export const uploadChatMedia = async (
  file: File,
  senderId: string,
  recipientId: string,
): Promise<UploadedMedia> => {
  const kind = detectKind(file);
  const limit = CHAT_MEDIA_LIMITS[kind];
  if (file.size > limit) {
    throw new Error(`${kind} too large (max ${formatBytes(limit)})`);
  }

  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${senderId}/${recipientId}/${Date.now()}_${safeName}`;

  const { error: uploadErr } = await supabase.storage
    .from('chat-media')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw uploadErr;

  const { data: signed, error: signErr } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
  if (signErr) throw signErr;

  return {
    media_url: signed.signedUrl,
    media_type: kind,
    media_name: file.name,
    media_size: file.size,
    media_mime: file.type || 'application/octet-stream',
  };
};
