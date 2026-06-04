import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, Camera, Shield } from 'lucide-react';
import logo from '@/assets/rccg-nsp-logo.jpg';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const navigate = useNavigate();

  const handleForgotPassword = async () => {
    if (!email.trim()) { toast.error('Enter your email first'); return; }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Password reset link sent. Check your inbox.');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProfileImage(file);
      setProfilePreview(URL.createObjectURL(file));
    }
  };

  const uploadAvatar = async (userId: string) => {
    if (!profileImage) return null;
    const ext = profileImage.name.split('.').pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, profileImage, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    return publicUrl;
  };

  const promoteToAdmin = async (accessToken: string) => {
    const { data, error } = await supabase.functions.invoke('promote-admin', {
      body: { secret_key: adminKey },
    });
    if (error) throw new Error(error.message || 'Failed to validate admin key');
    if (data?.error) throw new Error(data.error);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (isAdminMode && adminKey) {
          try {
            await promoteToAdmin(signInData.session?.access_token || '');
            toast.success('Welcome, Admin!');
          } catch (adminError: any) {
            toast.error(adminError.message);
            setLoading(false);
            return;
          }
        } else {
          toast.success('Welcome back!');
        }
        navigate('/');
      } else {
        if (!fullName.trim()) { toast.error('Full name is required'); setLoading(false); return; }
        if (!phoneNumber.trim()) { toast.error('Phone number is required'); setLoading(false); return; }
        if (!/^[+\d][\d\s\-()]{6,}$/.test(phoneNumber.trim())) { toast.error('Please enter a valid phone number'); setLoading(false); return; }
        if (!dateOfBirth) { toast.error('Date of birth is required'); setLoading(false); return; }
        if (isAdminMode && !adminKey) { toast.error('Admin secret key is required'); setLoading(false); return; }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (data.user) {
          let imageUrl = null;
          if (profileImage) {
            imageUrl = await uploadAvatar(data.user.id);
          }

          await supabase.from('profiles').update({
            full_name: fullName,
            date_of_birth: dateOfBirth,
            phone_number: phoneNumber.trim(),
            ...(imageUrl && { profile_image_url: imageUrl }),
          }).eq('id', data.user.id);

          // If admin mode, promote after signup
          if (isAdminMode && adminKey && data.session) {
            try {
              await promoteToAdmin(data.session.access_token);
              toast.success('Admin account created!');
            } catch (adminError: any) {
              toast.error(`Account created but admin promotion failed: ${adminError.message}`);
            }
          } else {
            toast.success('Account created!');
          }
        }
        navigate('/');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 140, damping: 14 }}
            className="relative w-28 h-28 mx-auto mb-4"
          >
            {isAdminMode ? (
              <div className="w-full h-full rounded-3xl bg-amber-500 flex items-center justify-center shadow-2xl shadow-amber-500/40">
                <Shield className="w-12 h-12 text-white" />
              </div>
            ) : (
              <>
                <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl" />
                <img
                  src={logo}
                  alt="RCCG NSP"
                  className="relative w-full h-full object-contain rounded-2xl"
                />
              </>
            )}
          </motion.div>
          <h1 className="text-2xl font-bold font-display text-foreground tracking-tight">
            {isAdminMode ? 'Admin Access' : 'RCCG N.S.P'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isLogin ? 'Welcome back to the community' : 'Join the family — create your account'}
          </p>
        </div>

        <div className="neumorphic rounded-2xl p-6 bg-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="signup-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4"
                >
                  <div className="flex justify-center">
                    <label className="cursor-pointer">
                      <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden neumorphic-inset">
                        {profilePreview ? (
                          <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                    </label>
                  </div>

                  <div>
                    <Label htmlFor="fullName" className="text-foreground">Full Name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                      className="mt-1 bg-muted border-0 neumorphic-inset"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-foreground">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+1 555 123 4567"
                      className="mt-1 bg-muted border-0 neumorphic-inset"
                    />
                  </div>

                  <div>
                    <Label htmlFor="dob" className="text-foreground">Date of Birth</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="mt-1 bg-muted border-0 neumorphic-inset"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 bg-muted border-0 neumorphic-inset"
                required
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-muted border-0 neumorphic-inset pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Admin Key Field */}
            <AnimatePresence>
              {isAdminMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Label htmlFor="adminKey" className="text-foreground">Admin Secret Key</Label>
                  <Input
                    id="adminKey"
                    type="password"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    placeholder="Enter admin secret key"
                    className="mt-1 bg-muted border-0 neumorphic-inset"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={loading}
              className={`w-full text-primary-foreground hover:opacity-90 rounded-xl h-12 text-base font-medium ${
                isAdminMode ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary'
              }`}
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-4 space-y-2 text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary text-sm font-medium"
            >
              {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
            </button>
            {isLogin && (
              <div>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={sendingReset}
                  className="text-muted-foreground text-xs underline-offset-2 hover:underline"
                >
                  {sendingReset ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
            )}
            <div>
              <button
                type="button"
                onClick={() => setIsAdminMode(!isAdminMode)}
                className="text-muted-foreground text-xs flex items-center gap-1 mx-auto"
              >
                <Shield className="w-3 h-3" />
                {isAdminMode ? 'Switch to User Mode' : 'Admin Access'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
