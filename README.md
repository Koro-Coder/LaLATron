# LaLaTron

A Manifest V3 Chrome extension that puts a Groq-backed LLM assistant in your browser toolbar.

## Features

- **Chat** — talk to the LLM, optionally feeding it the current page's text (`Use page context`) or a screenshot of the visible tab (`Screenshot`).
- **Forms** — store one or more free-text "knowledge" documents and let the model autofill the current page's form fields from them.
- **Bookmarks** — save scroll positions on a page (including inside scrollable containers, e.g. chat transcripts) and jump back to them.
- **Settings** — your Groq API key and model choices.

## Requirements

- Google Chrome (or any Chromium browser) with Manifest V3 support.
- A **Groq API key** — free at <https://console.groq.com/keys>.

There is no build step and no dependencies: the extension is plain HTML/JS loaded directly.

## Install

1. Clone this repo.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the repo folder (the one containing `manifest.json`).

> Chrome 137+ no longer supports the `--load-extension` command-line switch, so the
> `chrome://extensions` UI is the only way to load this.

## Configure

The extension ships with **no API key** — you must add your own or every request will fail.

1. Click the LaLaTron toolbar icon.
2. Go to the **Settings** tab.
3. Paste your Groq API key (`gsk_...`) and click **Save settings**.

Defaults if you leave the model fields blank:

| Purpose | Model |
| --- | --- |
| Chat / autofill | `llama-3.3-70b-versatile` |
| Vision (screenshots) | `qwen/qwen3.6-27b` |

Settings are stored in `chrome.storage.local`, scoped to your browser profile.

## Layout

```
manifest.json      MV3 manifest
popup.html         Popup UI (all four tabs) + inline CSS
Scripts/popup.js   Popup logic: chat, autofill UI, bookmarks, settings
Scripts/background.js  Service worker: all Groq API calls, tab screenshots
Scripts/content.js     Injected into every page: text scraping, form filling, scroll bookmarks
```

## Troubleshooting

- **"Groq API key is not configured"** — add your key in the Settings tab.
- **"Error from Groq: ..."** — the API rejected the request; the message is passed through
  verbatim (invalid key, decommissioned model, rate limit).
- **Nothing happens on a page** — content scripts are not injected into pages that already
  existed when the extension loaded. Reload the tab.
- **Content scripts never run on `chrome://` pages or the Chrome Web Store** — this is a
  browser restriction, not a bug.
- To see service worker logs, click **service worker** under the extension on `chrome://extensions`.

## Security note

Model requests are sent directly from the background service worker to
`api.groq.com` with your key in the `Authorization` header. The key lives in
`chrome.storage.local` in plaintext — treat it as you would any local credential,
and never commit it to this repo.
