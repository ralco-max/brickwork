import type { Metadata, Viewport } from "next";
import "./globals.css";
import {ThemeProvider} from "./theme";

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};

export const metadata: Metadata = {
  title: "Brickwork by Ralc",
  description: "Turn ideas, images and 3D models into custom brick creations. Edit every piece, audit your build and export your parts list.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
