import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'CrossFlow · Cross-Asset Intelligence',
  description:
    'A 24/7 cross-asset research and paper trading agent for traders outside US market hours.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
