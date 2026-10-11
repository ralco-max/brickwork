import type { Metadata, Viewport } from "next";
import "./globals.css";
import {ThemeProvider} from "./theme";
import {VisualViewportSize} from "@/hooks/use-visual-viewport";

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover"};

export const metadata: Metadata = {
  title: "Bricks by Ralc",
  description: "Turn ideas, images and 3D models into custom brick creations. Edit every piece, audit your build and export your parts list.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/bricks-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased"><VisualViewportSize/><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
