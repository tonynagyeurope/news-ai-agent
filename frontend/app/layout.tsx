// app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://news.tonynagy.io'),
  title: 'News AI Agent | Real-time topic search & AI summaries',
  description:
    'A serverless demo that turns user intent into automated AI actions: topic search, news retrieval, and LLM-based summarization.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'News AI Agent | Real-time topic search & AI summaries',
    description: 'Serverless demo: topic search, news retrieval, LLM summaries.',
    url: 'https://news.tonynagy.io',
    siteName: 'News AI Agent',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'News AI Agent | Real-time topic search & AI summaries',
    description: 'Serverless demo: topic search, news retrieval, LLM summaries.'
    // images: ['https://news.tonynagy.io/og.png']
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  }
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
