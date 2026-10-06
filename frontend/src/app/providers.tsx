import type { ReactNode } from 'react';
import { DemoDataProvider } from '../state/DemoDataProvider';
import { ToastProvider } from '../components/ui/Toast';

/** Single place where application-wide providers are composed. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DemoDataProvider>
      <ToastProvider>{children}</ToastProvider>
    </DemoDataProvider>
  );
}
