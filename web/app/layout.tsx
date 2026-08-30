import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LinkedIn Archive',
  description: 'Saved LinkedIn profiles with shared notes and tags.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
