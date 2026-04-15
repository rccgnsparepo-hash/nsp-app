import { ReactNode } from 'react';
import BottomTabBar from './BottomTabBar';

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-lg mx-auto">
        {children}
      </div>
      <BottomTabBar />
    </div>
  );
};

export default AppLayout;
