import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AdMagic Validator',
  description: 'Validate any Meta ad in one click, then pay the people who sell it, all with Qatom receipts.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <nav className="flex gap-6 border-b border-neutral-300 dark:border-neutral-700 px-6 py-3 text-sm">
          <Link href="/" className="font-semibold">AdMagic Validator</Link>
          <Link href="/affiliates">Affiliates</Link>
          <Link href="/activity">Activity</Link>
        </nav>
        <main className="flex-1 px-6 py-6 max-w-6xl w-full mx-auto">{children}</main>
      </body>
    </html>
  );
}
