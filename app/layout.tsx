import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LabOps - IT Service Desk & Active Directory Homelab Simulator',
  description: 'Practice real help desk and sysadmin tickets in your own Active Directory home lab. Sandbox training tool with fictional data.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F8FAFC' }, { media: '(prefers-color-scheme: dark)', color: '#090D16' }] };

// Runs before first paint so there is no flash. Default theme is LIGHT.
const themeScript = `try{var t=localStorage.getItem('labops-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
