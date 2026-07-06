import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import {
  initializeNotifications,
  login as osLogin,
  logout as osLogout,
  sendTokenToServer,
  getDeviceState,
  isNativeApp,
} from '@/services/notificationService';
import { useAuth } from '@/contexts/AuthContext';

export function usePushNotifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<any>(null);
  const bootedRef = useRef(false);

  // Initialize once on mount (native only).
  useEffect(() => {
    if (!isNativeApp() || bootedRef.current) return;
    bootedRef.current = true;
    initializeNotifications((path) => navigate(path));

    const refresh = async () => setState(await getDeviceState());
    refresh();

    const appSub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) refresh();
    });
    const netSub = Network.addListener('networkStatusChange', (s) => {
      if (s.connected && user?.id) sendTokenToServer(user.id);
    });
    const t = setInterval(refresh, 30000);
    return () => {
      appSub.then((s) => s.remove());
      netSub.then((s) => s.remove());
      clearInterval(t);
    };
  }, [navigate, user?.id]);

  // Link / unlink on auth state.
  useEffect(() => {
    if (!isNativeApp()) return;
    if (user?.id) osLogin(user.id);
    return () => { /* logout handled explicitly in AuthContext.signOut */ };
  }, [user?.id]);

  return {
    ...state,
    isNative: isNativeApp(),
    reconnect: async () => user?.id && sendTokenToServer(user.id),
    refresh: async () => setState(await getDeviceState()),
  };
}

export { osLogout };
