import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Detasad Project Dashboard',
  description: 'Enterprise project financial tracking, revenue recognition, risk, and reporting built with Next.js and Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('sap-cn41-theme');
                  var nextTheme = theme === 'light' || theme === 'dark' ? theme : 'light';
                  document.documentElement.dataset.theme = nextTheme;
                } catch (e) {
                  document.documentElement.dataset.theme = 'light';
                }
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
