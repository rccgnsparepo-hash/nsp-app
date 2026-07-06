import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { registerServiceWorker, ensurePushSubscription, installPushNavListener, unsubscribePush } from '@/lib/webpush';
import { logout as osLogout } from '@/services/notificationService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: any | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(profileData);

    // Sync theme from Supabase on every load so it never glitches back to light
    try {
      const serverTheme = profileData?.theme_preference;
      if (serverTheme === 'dark' || serverTheme === 'light') {
        localStorage.setItem('nsp-theme', serverTheme);
        document.documentElement.classList.toggle('dark', serverTheme === 'dark');
      }
    } catch {}

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    setIsAdmin(roleData?.some(r => r.role === 'admin') ?? false);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    registerServiceWorker().catch(() => {});
    installPushNavListener();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
          // Silently refresh the VAPID push subscription if the user already
          // granted permission. SoftPushPrompt asks for permission otherwise.
          setTimeout(async () => {
            try { await ensurePushSubscription(session.user.id); } catch {}
          }, 800);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        setTimeout(async () => {
          try { await ensurePushSubscription(session.user.id); } catch {}
        }, 800);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (user) {
      try { await unsubscribePush(user.id); } catch {}
      try { await osLogout(); } catch {}
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
