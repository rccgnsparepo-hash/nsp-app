import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/components/AppLayout';
import AppHeader from '@/components/AppHeader';
import AttendanceSection from '@/components/AttendanceSection';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Camera, LogOut, User as UserIcon, ClipboardCheck, KeyRound } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const ProfilePage = () => {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'attendance' ? 'attendance' : 'details';
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [dob, setDob] = useState(profile?.date_of_birth || '');
  const [saving, setSaving] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ profile_image_url: publicUrl }).eq('id', user.id);
      await refreshProfile();
      toast.success('Photo updated');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: fullName,
        date_of_birth: dob || null,
      }).eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      setEditing(false);
      toast.success('Profile updated');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendReset = async () => {
    if (!user?.email) { toast.error('No email on this account'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success('Password reset link sent to your email.');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <AppLayout>
      <AppHeader title="Profile" />

      <div className="p-4 space-y-6">
        {/* Avatar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center">
          <label className="cursor-pointer relative">
            <div className="w-28 h-28 rounded-full overflow-hidden neumorphic">
              {profile?.profile_image_url ? (
                <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-3xl font-bold text-muted-foreground">
                    {profile?.full_name?.[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Camera className="w-4 h-4 text-primary-foreground" />
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
          <h2 className="mt-3 text-lg font-semibold text-foreground">{profile?.full_name}</h2>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
        </motion.div>

        <Tabs defaultValue={initialTab} onValueChange={(v) => setSearchParams(v === 'attendance' ? { tab: 'attendance' } : {})} className="w-full">
          <TabsList className="w-full bg-muted rounded-xl grid grid-cols-2 h-10">
            <TabsTrigger value="details" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <UserIcon className="w-3.5 h-3.5 mr-1" />Details
            </TabsTrigger>
            <TabsTrigger value="attendance" className="rounded-lg text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <ClipboardCheck className="w-3.5 h-3.5 mr-1" />Attendance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-6">
            <div className="neumorphic rounded-2xl p-4 bg-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Details</h3>
                <button
                  onClick={() => {
                    if (editing) handleSave();
                    else {
                      setFullName(profile?.full_name || '');
                      setDob(profile?.date_of_birth || '');
                      setEditing(true);
                    }
                  }}
                  className="text-primary text-sm font-medium"
                >
                  {editing ? (saving ? 'Saving...' : 'Save') : 'Edit'}
                </button>
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-foreground">Full Name</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 bg-muted border-0 neumorphic-inset" />
                  </div>
                  <div>
                    <Label className="text-foreground">Date of Birth</Label>
                    <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-1 bg-muted border-0 neumorphic-inset" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm text-foreground">{profile?.full_name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm text-foreground">{profile?.email}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-sm text-muted-foreground">Birthday</span>
                    <span className="text-sm text-foreground">{profile?.date_of_birth || 'Not set'}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl p-4 bg-card border border-border space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Account recovery</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                We'll email you a secure link to set a new password.
              </p>
              <Button onClick={handleSendReset} variant="outline" className="w-full rounded-xl">
                Send password reset email
              </Button>
            </div>

            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full rounded-xl border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <AttendanceSection />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default ProfilePage;
