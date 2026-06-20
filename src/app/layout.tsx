import type { Metadata } from "next";
import "./globals.css";
import AnimatedBackground from "../components/AnimatedBackground";

export const metadata: Metadata = {
  metadataBase: new URL('https://outreachpro.a-s-solution.online'),
  title: "OutreachPro | Enterprise Bulk Email Automation & SMTP Outreach Engine",
  description: "Boost your business growth with OutreachPro by A&S Solution. The ultimate bulk email automation tool with precision SMTP delivery, smart lead parsing, and real-time monitoring. Start your cold email campaigns today.",
  keywords: "email automation, bulk email sender, cold email outreach, SMTP delivery, lead management, email marketing tool, OutreachPro, A&S Solution, automated email campaigns",
  authors: [{ name: "A&S Solution", url: "https://a-s-solution.online" }],
  creator: "A&S Solution",
  publisher: "A&S Solution",
  openGraph: {
    title: "OutreachPro | Enterprise Bulk Email Automation",
    description: "Precision-engineered email outreach system for high-conversion campaigns.",
    url: "https://outreachpro.a-s-solution.online",
    siteName: "OutreachPro",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "OutreachPro Dashboard",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OutreachPro | Bulk Email Automation",
    description: "Automate your business growth with precision-engineered email outreach.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

// The theme-init script must be a plain <script> tag so it runs synchronously
// before React hydration (preventing flash of wrong theme).
const themeScript = `(function(){try{var t=localStorage.getItem('outreachpro_theme')||'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');document.documentElement.classList.remove('light');}else{document.documentElement.classList.add('light');document.documentElement.classList.remove('dark');}}catch(e){}})();`;

import { Inter } from 'next/font/google';
import HydrationHelper from "../components/HydrationHelper";

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <script
          id="theme-script"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <HydrationHelper />
        <AnimatedBackground />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
