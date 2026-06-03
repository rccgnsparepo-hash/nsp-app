import { ReactNode } from 'react';
import BottomTabBar from './BottomTabBar';
import DesktopSidebar from './DesktopSidebar';

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-background flex">
      <DesktopSidebar />
      <div className="flex-1 min-w-0 pb-20 lg:pb-0">
        <div className="max-w-lg lg:max-w-3xl xl:max-w-5xl mx-auto">
          {children}
        </div>
      </div>
      <div className="lg:hidden">
        <BottomTabBar />
      </div>
    </div>
  );
};

export default AppLayout;
