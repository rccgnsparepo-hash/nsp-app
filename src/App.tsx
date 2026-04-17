import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useEffect } from "react";
import { initOneSignal, setOneSignalUser } from "@/lib/onesignal";
import Auth from "./pages/Auth";
import HomePage from "./pages/HomePage";
import PrayerPage from "./pages/PrayerPage";
import GalleryPage from "./pages/GalleryPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import CreatePostPage from "./pages/CreatePostPage";
import VideosPage from "./pages/VideosPage";
import NewsPage from "./pages/NewsPage";
import MemesPage from "./pages/MemesPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (user) setOneSignalUser(user.id);
  }, [user]);
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  useEffect(() => {
    initOneSignal(import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined);
  }, []);
  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/videos" element={<ProtectedRoute><VideosPage /></ProtectedRoute>} />
      <Route path="/news" element={<ProtectedRoute><NewsPage /></ProtectedRoute>} />
      <Route path="/memes" element={<ProtectedRoute><MemesPage /></ProtectedRoute>} />
      <Route path="/prayer" element={<ProtectedRoute><PrayerPage /></ProtectedRoute>} />
      <Route path="/gallery" element={<ProtectedRoute><GalleryPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/create" element={<ProtectedRoute><CreatePostPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <AppRoutes />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
