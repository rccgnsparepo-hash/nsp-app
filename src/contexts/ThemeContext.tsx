import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';

type Theme = 'light' | 'dark' | 'cyberpunk' | 'minimal';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>('light');
  const { user, profile } = useAuth();

  useEffect(() => {
    const saved = profile?.theme_preference as Theme;
    if (saved) setThemeState(saved);
  }, [profile?.theme_preference]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'cyberpunk', 'minimal');
    if (theme === 'dark' || theme === 'cyberpunk') root.classList.add('dark');
    if (theme === 'cyberpunk') root.classList.add('cyberpunk');
    if (theme === 'minimal') root.classList.add('minimal');
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    if (user) {
      await supabase.from('profiles').update({ theme_preference: newTheme }).eq('id', user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
