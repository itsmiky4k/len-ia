import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata = {
  title: "LEN-IA — Social Media Manager AI",
  description: "Il social media manager AI del Collettivo LEN",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#E8354A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LEN-IA" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
