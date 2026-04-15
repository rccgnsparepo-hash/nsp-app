import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGallery } from '@/hooks/useGallery';
import AppLayout from '@/components/AppLayout';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

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
      <div className="sticky top-0 z-40 glass px-4 py-3 border-b border-border">
        <h1 className="text-xl font-bold font-display text-foreground">Gallery</h1>
      </div>

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
              <motion.button
                key={img.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedIndex(idx)}
                className="relative aspect-square rounded-2xl overflow-hidden neumorphic-sm"
              >
                <img
                  src={img.image_url}
                  alt={img.caption || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {img.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/60 to-transparent p-2">
                    <p className="text-[11px] text-card truncate">{img.caption}</p>
                  </div>
                )}
              </motion.button>
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
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-card/20 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-card" />
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
