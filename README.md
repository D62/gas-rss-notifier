# gas-rss-notifier

A minimal Google Apps Script that polls RSS/Atom feeds and emails you (via Gmail) when new items appear, optionally filtered by keywords.

## How it works

- `checkFeeds()` runs on a time-driven trigger (every 30 min by default).
- For each feed in `FEEDS`, it fetches and parses the feed (RSS 2.0 or Atom), diffs entry IDs against what was seen last run (stored in Script Properties), and emails any new item matching the feed's keywords.
- If no `keywords` are set for a feed, every new item triggers an email.
- On the very first run for a feed, it just records the current items as a baseline (no email flood on setup).

## Setup

1. Install [clasp](https://github.com/google/clasp) and log in:
   ```
   npm install -g @google/clasp
   clasp login
   ```
2. Clone this repo and create your own private config:
   ```
   cp Config.gs.sample Config.gs
   ```
   Edit `Config.gs` with the feeds you want to monitor:
   ```js
   const FEEDS = [
     { url: 'https://example.com/feed.xml', keywords: [] },
     { url: 'https://blog.example.com/rss', keywords: ['launch', 'release'] },
   ];
   ```
3. Create your own Apps Script project (this generates a private `.clasp.json` with your own script ID):
   ```
   clasp create --type standalone --title "RSS Gmail Notifier"
   ```
4. Push the code and open the project:
   ```
   clasp push
   clasp open
   ```
5. In the Apps Script editor, run `setup()` once. This will prompt you to authorize Gmail/UrlFetch/trigger permissions, and installs the 30-minute polling trigger.

## Important: edit locally, not in the online editor

`clasp push` overwrites the Apps Script project with your local files. If you edit `Config.gs` (or anything else) directly in the online editor, run `clasp pull` first to bring those changes back locally before pushing again — otherwise the next `clasp push` will silently discard them.

## Privacy

`Config.gs` and `.clasp.json` are gitignored — your feed list and your script ID never get committed. Anyone cloning this repo starts from `Config.gs.sample` and deploys to their own Apps Script project with their own feeds.

## Files

- `Code.gs` — polling, parsing, and notification logic (shared, versioned)
- `Config.gs.sample` — template for your feed list (versioned)
- `Config.gs` — your actual feed list (gitignored, not versioned)
- `appsscript.json` — Apps Script manifest
