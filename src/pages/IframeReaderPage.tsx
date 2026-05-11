import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const IframeReaderPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const url = params.get('url') ?? '';
  const [errored, setErrored] = useState(false);
  const [key, setKey] = useState(0);

  let host = '';
  try { host = new URL(url).hostname.replace('www.', ''); } catch {}

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-20 glass border-b border-border safe-top">
        <div className="flex items-center gap-2 px-3 h-14 max-w-lg mx-auto w-full">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center neumorphic-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{host}</p>
            <p className="text-[10px] text-muted-foreground truncate">{url}</p>
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setErrored(false); setKey(k => k + 1); }} className="h-8 w-8">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <a href={url} target="_blank" rel="noreferrer"
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </header>
      <div className="flex-1 relative bg-background">
        {errored ? (
          <div className="p-6 text-center max-w-md mx-auto">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">This site blocks embedded viewing.</p>
            <p className="text-xs text-muted-foreground mt-2">
              {host} doesn't allow itself to be displayed inside another app.
            </p>
            <a href={url} target="_blank" rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold">
              <ExternalLink className="w-3 h-3" /> Open in browser
            </a>
          </div>
        ) : (
          <iframe
            key={key}
            src={url}
            className="w-full h-full border-0"
            style={{ minHeight: 'calc(100vh - 56px)' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            onError={() => setErrored(true)}
          />
        )}
      </div>
    </div>
  );
};

export default IframeReaderPage;
