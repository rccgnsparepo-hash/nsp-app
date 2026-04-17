import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts tokens in the URL hash for password recovery
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || searchParams.get('type') === 'recovery') {
      setReady(true);
    } else {
      // Check if already in a recovery session
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) setReady(true);
        else setReady(true); // Still allow attempt
      });
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated! Sign in with your new password.');
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm neumorphic rounded-3xl p-6 bg-card">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold font-display text-foreground">Reset Password</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your new password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-foreground">New Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 bg-muted border-0 neumorphic-inset"
            />
          </div>
          <div>
            <Label className="text-foreground">Confirm Password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
              className="mt-1 bg-muted border-0 neumorphic-inset"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground rounded-xl">
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
          <button type="button" onClick={() => navigate('/auth')} className="w-full text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
