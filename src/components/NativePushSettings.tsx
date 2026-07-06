import { useEffect, useState } from 'react';
import { Bell, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  requestPermission,
  subscribe,
  unsubscribe,
  isNativeApp,
  getDeviceState,
} from '@/services/notificationService';
import { toast } from 'sonner';

export default function NativePushSettings() {
  const { isNative, reconnect } = usePushNotifications();
  const [s, setS] = useState<any>(null);

  const refresh = async () => setS(await getDeviceState());
  useEffect(() => { refresh(); }, []);

  if (!isNative && !isNativeApp()) {
    return null; // Web build – VAPID handled elsewhere.
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <Smartphone className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Native push (Android)</p>
          <p className="text-xs text-muted-foreground">OneSignal-powered notifications</p>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={refresh}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="text-xs space-y-1">
        <Row k="Permission" v={s?.permission ? 'granted' : 'not granted'} />
        <Row k="Subscribed" v={s?.optedIn ? 'yes' : 'no'} />
        <Row k="OneSignal ID" v={s?.oneSignalId ?? '—'} />
        <Row k="Device model" v={s?.model ?? '—'} />
        <Row k="OS version" v={s?.osVersion ?? '—'} />
        <Row k="App version" v={s?.appVersion ?? '—'} />
        <Row k="Last sync" v={s?.lastSync ?? '—'} />
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={async () => {
          const ok = await requestPermission();
          toast[ok ? 'success' : 'error'](ok ? 'Permission granted' : 'Permission denied');
          refresh();
        }}>
          <Bell className="w-3.5 h-3.5 mr-1" />Request
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={async () => {
          await reconnect(); toast.success('Re-synced with backend'); refresh();
        }}>
          Re-sync
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={async () => {
          await subscribe(); toast.success('Subscribed'); refresh();
        }}>
          Enable
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={async () => {
          await unsubscribe(); toast('Unsubscribed'); refresh();
        }}>
          Disable
        </Button>
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-2">
    <span className="opacity-60">{k}</span>
    <span className="text-right break-all font-mono">{v}</span>
  </div>
);
