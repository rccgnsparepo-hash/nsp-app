import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, Plus, Check, X, Users, Clock, MapPin, Download } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
    approved: { label: 'Approved', cls: 'bg-green-500/10 text-green-600 dark:text-green-400' },
    rejected: { label: 'Rejected', cls: 'bg-destructive/10 text-destructive' },
  };
  const m = map[status] ?? map.pending;
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
};

const AttendanceSection = () => {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [rosterFor, setRosterFor] = useState<any | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false);

  // Sessions
  const { data: sessions } = useQuery({
    queryKey: ['attendance-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .select('*')
        .order('session_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // All records (for current sessions)
  const sessionIds = (sessions ?? []).map((s: any) => s.id);
  const { data: records } = useQuery({
    queryKey: ['attendance-records', sessionIds.join(',')],
    queryFn: async () => {
      if (sessionIds.length === 0) return [];
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .in('session_id', sessionIds);
      if (error) throw error;
      return data;
    },
    enabled: sessionIds.length > 0,
  });

  // Profile lookup for roster
  const userIds = Array.from(new Set((records ?? []).map((r: any) => r.user_id)));
  const { data: profiles } = useQuery({
    queryKey: ['attendance-profiles', userIds.join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, email, profile_image_url').in('id', userIds);
      if (error) throw error;
      return data;
    },
    enabled: userIds.length > 0,
  });
  const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('attendance-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_sessions' },
        () => qc.invalidateQueries({ queryKey: ['attendance-sessions'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' },
        () => qc.invalidateQueries({ queryKey: ['attendance-records'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const createSession = async () => {
    if (!user) return;
    if (!title.trim() || !date) { toast.error('Title and date are required'); return; }
    setCreating(true);
    try {
      const { error } = await supabase.from('attendance_sessions').insert({
        title: title.trim(),
        description: description.trim() || null,
        session_date: date,
        session_time: time || null,
        location: location.trim() || null,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success('Session created — everyone notified');
      setTitle(''); setDescription(''); setTime(''); setLocation('');
      setCreateOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const markAttendance = async (sessionId: string) => {
    if (!user) return;
    const { error } = await supabase.from('attendance_records').insert({
      session_id: sessionId, user_id: user.id, status: 'pending',
    });
    if (error) {
      if (error.code === '23505') toast.info('You already marked this session');
      else toast.error(error.message);
      return;
    }
    toast.success('Marked! Awaiting admin approval');
  };

  const reviewRecord = async (recordId: string, status: 'approved' | 'rejected') => {
    if (!user) return;
    const { error } = await supabase.from('attendance_records').update({
      status, reviewed_at: new Date().toISOString(), reviewed_by: user.id,
    }).eq('id', recordId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked ${status}`);
  };

  const myRecord = (sessionId: string) =>
    (records ?? []).find((r: any) => r.session_id === sessionId && r.user_id === user?.id);

  const rosterForSession = (sessionId: string) =>
    (records ?? []).filter((r: any) => r.session_id === sessionId);

  const exportRosterCsv = (session: any) => {
    const roster = rosterForSession(session.id);
    const escape = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['Name', 'Email', 'Status', 'Marked At', 'Reviewed At'];
    const rows = roster.map((r: any) => {
      const p: any = profMap.get(r.user_id);
      return [
        p?.full_name || 'Unknown',
        p?.email || '',
        r.status,
        new Date(r.marked_at).toISOString(),
        r.reviewed_at ? new Date(r.reviewed_at).toISOString() : '',
      ].map(escape).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const safe = session.title.replace(/[^a-z0-9-_]+/gi, '_');
    const filename = `attendance_${safe}_${session.session_date}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Attendance</h3>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary text-primary-foreground rounded-full h-8 px-3 text-xs">
                <Plus className="w-3 h-3 mr-1" />New session
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-w-sm">
              <DialogHeader><DialogTitle>Create attendance session</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunday Service" className="mt-1 bg-muted border-0 neumorphic-inset" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 bg-muted border-0 neumorphic-inset" />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 bg-muted border-0 neumorphic-inset" />
                  </div>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Main hall" className="mt-1 bg-muted border-0 neumorphic-inset" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" className="mt-1 bg-muted border-0 neumorphic-inset" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl">Cancel</Button>
                <Button onClick={createSession} disabled={creating} className="bg-primary text-primary-foreground rounded-xl">
                  {creating ? 'Creating…' : 'Create + notify'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {(sessions ?? []).length === 0 && (
        <div className="neumorphic rounded-2xl p-6 bg-card text-center">
          <p className="text-sm text-muted-foreground">
            {isAdmin ? 'No sessions yet — tap "New session" to create one.' : 'No attendance sessions yet'}
          </p>
        </div>
      )}

      {sessions?.map((s: any) => {
        const mine = myRecord(s.id);
        const roster = rosterForSession(s.id);
        const pendingCount = roster.filter((r: any) => r.status === 'pending').length;
        const approvedCount = roster.filter((r: any) => r.status === 'approved').length;
        return (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="neumorphic rounded-2xl p-4 bg-card space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{s.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" />{format(new Date(s.session_date), 'EEE, MMM d')}
                  </span>
                  {s.session_time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{s.session_time.slice(0,5)}</span>}
                  {s.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.location}</span>}
                </div>
                {s.description && <p className="text-xs text-muted-foreground mt-1.5">{s.description}</p>}
              </div>
              {mine && <StatusBadge status={mine.status} />}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button onClick={() => setRosterFor(s)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Users className="w-3.5 h-3.5" />
                {approvedCount} present{pendingCount > 0 && ` · ${pendingCount} pending`}
              </button>
              {!mine ? (
                <Button size="sm" onClick={() => markAttendance(s.id)} className="bg-primary text-primary-foreground rounded-full h-7 px-3 text-xs">
                  Mark attendance
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Marked {format(new Date(mine.marked_at), 'MMM d · h:mm a')}</span>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* Roster dialog */}
      <Dialog open={!!rosterFor} onOpenChange={(o) => !o && setRosterFor(null)}>
        <DialogContent className="rounded-2xl max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="truncate">{rosterFor?.title}</DialogTitle>
              {isAdmin && rosterFor && rosterForSession(rosterFor.id).length > 0 && (
                <Button size="sm" variant="outline" onClick={() => exportRosterCsv(rosterFor)} className="rounded-full h-8 px-3 text-xs flex-shrink-0">
                  <Download className="w-3 h-3 mr-1" />CSV
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-2">
            {rosterFor && rosterForSession(rosterFor.id).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nobody marked yet</p>
            )}
            {rosterFor && rosterForSession(rosterFor.id).map((r: any) => {
              const p: any = profMap.get(r.user_id);
              return (
                <div key={r.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/40">
                  <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex-shrink-0">
                    {p?.profile_image_url ? (
                      <img src={p.profile_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        {p?.full_name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p?.full_name || 'User'}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  {isAdmin && r.status === 'pending' && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" onClick={() => reviewRecord(r.id, 'approved')} className="h-8 w-8 rounded-full text-green-600">
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => reviewRecord(r.id, 'rejected')} className="h-8 w-8 rounded-full text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AttendanceSection;
