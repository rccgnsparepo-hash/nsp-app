import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationsProvider } from "@/hooks/useRealtimeNotifications";
import NotificationOverlay from "@/components/NotificationOverlay";
import SplashScreen from "@/components/SplashScreen";
import PushDebugPanel from "@/components/PushDebugPanel";
import Auth from "./pages/Auth";
import HomePage from "./pages/HomePage";
import PrayerPage from "./pages/PrayerPage";
import GalleryPage from "./pages/GalleryPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import SettingsPage from "./pages/SettingsPage";
import ChatThreadPage from "./pages/ChatThreadPage";
import InboxPage from "./pages/InboxPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <NotificationsProvider>
      <NotificationOverlay />
      {children}
      <PushDebugPanel />
    </NotificationsProvider>
  );
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
    <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
    <Route path="/prayer" element={<ProtectedRoute><PrayerPage /></ProtectedRoute>} />
    <Route path="/gallery" element={<ProtectedRoute><GalleryPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
     <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
    <Route path="/chat/:userId" element={<ProtectedRoute><ChatThreadPage /></ProtectedRoute>} />
    <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
