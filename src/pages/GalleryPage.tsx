import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGallery } from '@/hooks/useGallery';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { toast } from 'sonner';

const downloadImage = async (url: string, filename: string) => {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('Failed to fetch');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank');
    toast.info('Opened image in new tab — long-press / right-click to save');
  }
};

const GalleryPage = () => {
  const { data: images, isLoading } = useGallery();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const goNext = () => {
    if (selectedIndex !== null && images) {
      setSelectedIndex((selectedIndex + 1) % images.length);
    }
  };

  const goPrev = () => {
    if (selectedIndex !== null && images) {
      setSelectedIndex((selectedIndex - 1 + images.length) % images.length);
    }
  };

  return (
    <AppLayout>
      <AppHeader title="Gallery" />

      <div className="p-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="aspect-square rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : images && images.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {images.map((img, idx) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="relative aspect-square rounded-2xl overflow-hidden neumorphic-sm group"
              >
                <button
                  onClick={() => setSelectedIndex(idx)}
                  className="absolute inset-0 w-full h-full"
                  aria-label="Open image"
                >
                  <img
                    src={img.image_url}
                    alt={img.caption || ''}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadImage(img.image_url, `nsp-${img.id}.jpg`); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-card/90 backdrop-blur flex items-center justify-center shadow-md z-10"
                  aria-label="Download"
                >
                  <Download className="w-4 h-4 text-foreground" />
                </button>
                {img.caption && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/60 to-transparent p-2">
                    <p className="text-[11px] text-card truncate">{img.caption}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No images yet</p>
          </div>
        )}
      </div>

      {/* Fullscreen Preview */}
      <AnimatePresence>
        {selectedIndex !== null && images && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-foreground/95 flex items-center justify-center"
            onClick={() => setSelectedIndex(null)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedIndex(null); }}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-card/20 flex items-center justify-center z-10"
            >
              <X className="w-5 h-5 text-card" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const img = images[selectedIndex];
                downloadImage(img.image_url, `nsp-${img.id}.jpg`);
              }}
              className="absolute top-4 right-16 w-10 h-10 rounded-full bg-card/20 flex items-center justify-center z-10"
              aria-label="Download"
            >
              <Download className="w-5 h-5 text-card" />
            </button>

            {images.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                  className="absolute left-2 w-10 h-10 rounded-full bg-card/20 flex items-center justify-center"
                >
                  <ChevronLeft className="w-5 h-5 text-card" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  className="absolute right-2 w-10 h-10 rounded-full bg-card/20 flex items-center justify-center"
                >
                  <ChevronRight className="w-5 h-5 text-card" />
                </button>
              </>
            )}

            <motion.img
              key={selectedIndex}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={images[selectedIndex].image_url}
              alt={images[selectedIndex].caption || ''}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            {images[selectedIndex].caption && (
              <div className="absolute bottom-8 left-0 right-0 text-center">
                <p className="text-card text-sm">{images[selectedIndex].caption}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
};

export default GalleryPage;
