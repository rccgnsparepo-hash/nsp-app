import { buildYoutubeEmbedUrl } from '@/lib/youtube';
import { AlertCircle } from 'lucide-react';

interface YoutubeEmbedProps {
  url: string;
  title?: string;
}

const YoutubeEmbed = ({ url, title = 'YouTube video' }: YoutubeEmbedProps) => {
  const embedUrl = buildYoutubeEmbedUrl(url);

  if (!embedUrl) {
    return (
      <div className="aspect-video w-full bg-muted flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <AlertCircle className="w-6 h-6" />
        <p className="text-sm font-medium">Invalid video link</p>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden">
      <iframe
        src={embedUrl}
        title={title}
        loading="lazy"
        className="absolute inset-0 w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
};

export default YoutubeEmbed;
