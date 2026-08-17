/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HOME } from "../content/site";
import { CSS } from "../styles";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: HOME.title },
      { name: "description", content: HOME.tagline },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Inlined so the built page references no external stylesheet. */}
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        {children}
        {/* Hydration for `vite dev`; stripped from the prerendered output. */}
        <Scripts />
      </body>
    </html>
  );
}
