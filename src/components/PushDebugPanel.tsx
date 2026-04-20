import { useEffect, useState } from 'react';
import { Bug, Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getPlayerId, requestPushPermission, linkUserToPush } from '@/lib/onesignal';
import { toast } from 'sonner';

interface State {
  permission: NotificationPermission | 'unsupported';
  playerId: string | null;
  externalId: string | null;
  oneSignalReady: boolean;
  lastEvent: string;
  lastResponse: string;
}

export const PushDebugPanel = () => {
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    playerId: null,
    externalId: null,
    oneSignalReady: false,
    lastEvent: '—',
    lastResponse: '—',
  });

  const refresh = async () => {
    const playerId = await getPlayerId();
    const ext = (window as any).OneSignal?.User?.externalId ?? null;
    setState(s => ({
      ...s,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      playerId,
      externalId: ext,
      oneSignalReady: !!(window as any).__oneSignalLoaded,
    }));
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const callSend = async (payload: any, label: string) => {
    setState(s => ({ ...s, lastEvent: label }));
    const { data, error } = await supabase.functions.invoke('send-notification', { body: payload });
    const out = error ? `ERROR: ${error.message}` : JSON.stringify(data);
    setState(s => ({ ...s, lastResponse: out }));
    if (error) toast.error(`${label} failed`);
    else toast.success(`${label} sent`);
  };

  const testBroadcast = () =>
    callSend({ broadcast: true, title: '📢 Test broadcast', message: 'All subscribed users should see this' }, 'Broadcast (admin post style)');

  const testPrayer = () =>
    callSend({ broadcast: true, title: '🙏 Test prayer', message: 'Prayer-style broadcast to everyone' }, 'Prayer broadcast');

  const testMessage = () => {
    if (!user?.id) return toast.error('Not signed in');
    callSend({ userIds: [user.id], title: '💬 Test DM', message: 'Self-targeted message via external_user_id' }, 'Direct message (self)');
  };

  const reLink = async () => {
    if (!user) return toast.error('Sign in first');
    await requestPushPermission();
    await linkUserToPush(user.id, user.email);
    await refresh();
    toast.success('Re-linked OneSignal user');
  };

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-24 right-4 z-50 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        aria-label="Push debug panel"
      >
        <Bug className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed bottom-40 right-4 z-50 w-[320px] max-w-[92vw] bg-card border border-border rounded-2xl p-4 shadow-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Push Debug</h3>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={refresh}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
          <Row k="User ID" v={user.id} />
          <Row k="Role" v={isAdmin ? 'admin' : 'user'} />
          <Row k="Permission" v={state.permission} highlight={state.permission !== 'granted'} />
          <Row k="OneSignal init" v={state.oneSignalReady ? 'yes' : 'no'} highlight={!state.oneSignalReady} />
          <Row k="External ID" v={state.externalId ?? '—'} highlight={!state.externalId} />
          <Row k="Player ID" v={state.playerId ?? '—'} highlight={!state.playerId} />
          <Row k="Last event" v={state.lastEvent} />
          <div className="text-[10px] break-all bg-muted rounded p-2 max-h-24 overflow-auto">
            <span className="opacity-60">Response: </span>{state.lastResponse}
          </div>
          <div className="grid grid-cols-1 gap-1 pt-1">
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={reLink}>
              Re-link & request permission
            </Button>
            <Button size="sm" className="h-8 text-[11px]" onClick={testBroadcast}>
              <Send className="w-3 h-3 mr-1" />Test admin-post push
            </Button>
            <Button size="sm" className="h-8 text-[11px]" onClick={testPrayer}>
              <Send className="w-3 h-3 mr-1" />Test prayer push
            </Button>
            <Button size="sm" className="h-8 text-[11px]" onClick={testMessage}>
              <Send className="w-3 h-3 mr-1" />Test message (self)
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
