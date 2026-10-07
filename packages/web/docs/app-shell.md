# The app shell

The frame around every page is gousse's `app-shell` registry item, composed once in `packages/web/src/App.tsx`: `AppShell` › `SidebarShell` + `AppMain` › `TopBar` + `AppContent`. The top bar is the layout's. A page fills it through `features/shell/PageTopBar.tsx`, which portals the page's `TopBarStart` / `TopBarTitle` / `TopBarEnd` into the header, so bar content is declared beside the body it belongs to. The collapsed sidebar's open button is the one child the bar contributes itself, so pages draw no `SidebarTrigger`.

That button stays leftmost because `App` gives the bar a slot to portal into rather than the header itself — a portal appends to its container, so portalling straight into the `<header>` put the trigger after the page controls when the sidebar collapsed later. The slot is a `display: contents` div, so `TopBarStart`/`TopBarEnd` are still flex items of the bar (`ml-auto` and the inbox's centred period nav resolve against the header) while DOM order is pinned. The bar widens to `gap-4` while collapsed.

The slot's context is tri-state: `undefined` means no layout above (a page mounted alone in a test) and the content renders in place; `null` means the bar has not attached yet, and nothing renders. `AppContent` is the content column's one scrolling element — `useScrollRestoration` takes that node and the bar watches it — so pages stay free of their own `overflow-y-auto`, and a sticky bar inside a page sticks at `top-0`. `App.test.tsx` renders all of that.

The shell owns no state. The collapsed flag is `App`'s, persisted in `localStorage`; the scroll node rides through a callback ref into state, because the bar renders before the region. The registry's `useAppShell` goes unused.

Below `sm` the same flag drives a drawer: `App` starts it closed there whatever the stored preference says, closes it on every navigation, and does not write the stored flag from that viewport. The inbox's period nav and select button move to `MobileBottomBar` below `md`, and the account switcher shows only its avatar there.
