import { useEffect, useState } from 'react';
import { Bug, Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  ensurePushSubscription,
  requestPushPermission,
  isPushSupported,
} from '@/lib/webpush';
import { toast } from 'sonner';

interface State {
  permission: NotificationPermission | 'unsupported';
  endpoint: string | null;
  swReady: boolean;
  lastEvent: string;
  lastResponse: string;
}

export const PushDebugPanel = () => {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    endpoint: null,
    swReady: false,
    lastEvent: '—',
    lastResponse: '—',
  });

  const refresh = async () => {
    let endpoint: string | null = null;
    let swReady = false;
    if (isPushSupported()) {
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        swReady = !!reg?.active;
        const sub = await reg?.pushManager.getSubscription();
        endpoint = sub?.endpoint ?? null;
      } catch {}
    }
    setState(s => ({
      ...s,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      endpoint,
      swReady,
    }));
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const callDispatch = async (payload: any, label: string) => {
    setState(s => ({ ...s, lastEvent: label }));
    const { data, error } = await supabase.functions.invoke('dispatch-notification', { body: payload });
    const out = error ? `ERROR: ${error.message}` : JSON.stringify(data);
    setState(s => ({ ...s, lastResponse: out }));
    if (error) toast.error(`${label} failed`);
    else toast.success(`${label} sent (${data?.sent ?? 0}/${data?.total ?? 0})`);
  };

  const testBroadcast = () =>
    callDispatch({ broadcast: true, title: '📢 Test broadcast', message: 'All subscribed users should see this', dedupe_id: 'test-broadcast' }, 'Broadcast');

  const testSelf = () => {
    if (!user?.id) return toast.error('Not signed in');
    callDispatch({ userIds: [user.id], title: '💬 Test push (self)', message: 'Self-targeted via VAPID', dedupe_id: 'test-self-' + Date.now() }, 'Self push');
  };

  const reSubscribe = async () => {
    if (!user) return toast.error('Sign in first');
    const ok = await requestPushPermission(user.id);
    if (ok) await ensurePushSubscription(user.id);
    await refresh();
    toast[ok ? 'success' : 'error'](ok ? 'Push subscription refreshed' : 'Permission denied');
  };

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-24 right-4 z-50 h-11 w-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
        aria-label="Push debug panel"
      >
        <Bug className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed bottom-40 right-4 z-50 w-[320px] max-w-[92vw] bg-card border border-border rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Web Push Debug</h3>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={refresh}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
          <Row k="User ID" v={user.id} />
          <Row k="Role" v={isAdmin ? 'admin' : 'user'} />
          <Row k="Permission" v={state.permission} highlight={state.permission !== 'granted'} />
          <Row k="SW active" v={state.swReady ? 'yes' : 'no'} highlight={!state.swReady} />
          <Row k="Endpoint" v={state.endpoint ? state.endpoint.slice(0, 40) + '…' : '—'} highlight={!state.endpoint} />
          <Row k="Last event" v={state.lastEvent} />
          <div className="text-[10px] break-all bg-muted rounded p-2 max-h-24 overflow-auto">
            <span className="opacity-60">Response: </span>{state.lastResponse}
          </div>
          <div className="grid grid-cols-1 gap-1 pt-1">
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={reSubscribe}>
              Re-subscribe & request permission
            </Button>
            <Button size="sm" className="h-8 text-[11px]" onClick={testBroadcast}>
              <Send className="w-3 h-3 mr-1" />Test broadcast
            </Button>
            <Button size="sm" className="h-8 text-[11px]" onClick={testSelf}>
              <Send className="w-3 h-3 mr-1" />Test push (self)
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

const Row = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => (
  <div className="flex justify-between gap-2">
    <span className="opacity-60">{k}</span>
    <span className={`text-right break-all ${highlight ? 'text-destructive font-medium' : ''}`}>{v}</span>
  </div>
);

export default PushDebugPanel;
