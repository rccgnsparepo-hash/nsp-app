import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, AlertTriangle, Send, RefreshCw, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const statusBadge = (status: string) => {
  if (status === 'sent') return { Icon: CheckCircle2, cls: 'text-green-600 bg-green-500/10' };
  if (status === 'no_subscribers' || status === 'skipped') return { Icon: AlertTriangle, cls: 'text-amber-600 bg-amber-500/10' };
  return { Icon: XCircle, cls: 'text-destructive bg-destructive/10' };
};

const PushDiagnostics = () => {
  const [filter, setFilter] = useState('');
  const [running, setRunning] = useState(false);
  const [runningZap, setRunningZap] = useState(false);
  const [e2e, setE2e] = useState<string>('');
  const [zapResult, setZapResult] = useState<string>('');

  const { data: zapStatus } = useQuery({
    queryKey: ['zapier-status'],
    queryFn: async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dispatch-notification?status=1`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        return await res.json();
      } catch { return { zapier_configured: false }; }
    },
  });

  const { data: logs, refetch, isLoading } = useQuery({
    queryKey: ['dispatch-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_dispatch_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['profiles-mini'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email');
      return data ?? [];
    },
  });

  const { data: subs } = useQuery({
    queryKey: ['push-subs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_push_subscriptions')
        .select('user_id, player_id, platform, updated_at')
        .order('updated_at', { ascending: false });
      return data ?? [];
    },
  });

  const profileById = useMemo(() => {
    const m = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase().trim();
    if (!f) return logs ?? [];
    return (logs ?? []).filter((l: any) => {
      const ids = (l.user_ids ?? []) as string[];
      const names = ids.map(id => profileById.get(id)?.full_name?.toLowerCase() ?? '').join(' ');
      const emails = ids.map(id => profileById.get(id)?.email?.toLowerCase() ?? '').join(' ');
      return (
        l.title?.toLowerCase().includes(f) ||
        l.body?.toLowerCase().includes(f) ||
        l.status?.toLowerCase().includes(f) ||
        l.target_type?.toLowerCase().includes(f) ||
        names.includes(f) || emails.includes(f) ||
        ids.some(id => id.includes(f))
      );
    });
  }, [logs, filter, profileById]);

  const runE2E = async () => {
    setRunning(true);
    setE2e('');
    try {
      const stamp = new Date().toISOString();
      const { data, error } = await supabase.functions.invoke('send-notification', {
        body: {
          broadcast: true,
          title: '🧪 E2E test — production push',
          message: `Verifying delivery from production at ${stamp}`,
          data: { type: 'e2e_test', stamp },
        },
      });
      if (error) throw error;
      const recipients = data?.oneSignal?.recipients;
      if (data?.ok && typeof recipients === 'number' && recipients > 0) {
        setE2e(`✅ Delivered to ${recipients} subscriber(s). OneSignal id: ${data.oneSignal.id}`);
        toast.success(`E2E push delivered to ${recipients} device(s)`);
      } else if (data?.reason === 'no_subscribers') {
        setE2e('⚠️ recipients = 0. No subscribed devices match. Visit https://nsp-main-app.vercel.app, accept push, then retry.');
        toast.warning('No subscribers found');
      } else {
        setE2e(`❌ Unexpected response: ${JSON.stringify(data)}`);
        toast.error('E2E failed — see details');
      }
      await refetch();
    } catch (e: any) {
      setE2e(`❌ Invoke failed: ${e.message}`);
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  const subsByUser = useMemo(() => {
    const m = new Map<string, number>();
    (subs ?? []).forEach((s: any) => m.set(s.user_id, (m.get(s.user_id) ?? 0) + 1));
    return m;
  }, [subs]);

  return (
    <div className="space-y-4">
      <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">End-to-end push test</h3>
          <Button size="sm" onClick={runE2E} disabled={running}>
            <Send className="w-3.5 h-3.5 mr-1" />{running ? 'Running…' : 'Run from production'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sends a broadcast through the same pipeline the app uses, then logs the OneSignal recipients count.
        </p>
        {e2e && (
          <pre className="text-[11px] bg-muted rounded p-2 whitespace-pre-wrap break-words">{e2e}</pre>
        )}
      </div>

      <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">Subscribed devices ({subs?.length ?? 0})</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          {(subs ?? []).length === 0 ? 'No devices have subscribed yet.' :
            `${subsByUser.size} unique users subscribed.`}
        </div>
      </div>

      <div className="neumorphic rounded-2xl p-4 bg-card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">Dispatch logs</h3>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
        <Input
          placeholder="Filter by user, email, status, title…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-muted border-0"
        />
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {filtered.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground text-center py-6">No dispatch records match.</p>
        )}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map((l: any) => {
            const { Icon, cls } = statusBadge(l.status);
            const ids = (l.user_ids ?? []) as string[];
            return (
              <div key={l.id} className="rounded-xl border border-border p-3 bg-background/60 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
                      <Icon className="w-3 h-3" />{l.status}
                    </span>
                    <p className="text-xs font-semibold text-foreground truncate">{l.title ?? '—'}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {format(new Date(l.created_at), 'MMM d HH:mm:ss')}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{l.body}</p>
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="bg-muted px-1.5 py-0.5 rounded">target: {l.target_type}</span>
                  <span className="bg-muted px-1.5 py-0.5 rounded">recipients: {l.recipients ?? 0}</span>
                  {l.onesignal_id && <span className="bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">id: {l.onesignal_id}</span>}
                </div>
                {ids.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ids.slice(0, 5).map(id => {
                      const p = profileById.get(id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          <UserIcon className="w-2.5 h-2.5" />
                          {p?.full_name ?? id.slice(0, 8)}
                        </span>
                      );
                    })}
                    {ids.length > 5 && <span className="text-[10px] text-muted-foreground">+{ids.length - 5}</span>}
                  </div>
                )}
                {l.error && (
                  <p className="text-[10px] text-destructive break-words">{l.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PushDiagnostics;
