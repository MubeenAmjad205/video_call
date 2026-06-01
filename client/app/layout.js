export const metadata = {
  title: 'Video Call',
  description: 'Mediasoup-powered video calling',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: '#0b0d10',
          color: '#f3f4f6',
          minHeight: '100vh',
        }}
      >
        {children}
      </body>
    </html>
  );
}
