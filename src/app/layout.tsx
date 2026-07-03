import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ten2Ten — Find your next place',
  description:
    'A verified community where NYC renters pass apartments directly to each other. No brokers. $100 to connect.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Ten2Ten — Find your next place',
    description:
      'A verified community where NYC renters pass apartments to each other. No brokers. $100 to connect.',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    title: 'Ten2Ten',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#1A1A18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
