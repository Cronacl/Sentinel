# Terminal and browser

Sentinel ships with a built-in terminal panel and a built-in browser sidebar.

These are part of the normal app shell.

## Terminal

The terminal lives in a bottom panel.

It supports:

- opening and closing the panel
- multiple sessions
- tab switching between sessions
- resizing the panel height
- closing sessions
- opening sessions in the workspace or repo path

The terminal is tied into the rest of the app. Repo actions can open it, and keyboard shortcuts can toggle it.

## Browser

The browser lives in the right sidebar.

It supports:

- multiple tabs
- back and forward navigation
- reload and stop
- address input
- opening normal URLs
- turning plain text into a search query

The browser is built around the desktop runtime. It behaves more like an app webview than a browser tab in a website.

## How they fit into the workflow

Both tools are there so you can stay in the thread while still doing the work around it.

That means you can:

- read a page without leaving the app
- run commands without switching windows
- inspect changes and keep the thread nearby

That is part of the general Sentinel shape. The app keeps the whole loop nearby.
