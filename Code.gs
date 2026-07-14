/**
 * RSS -> Gmail notifier.
 *
 * Setup:
 * 1. Copy Config.gs.sample to Config.gs and edit FEEDS (url + optional keywords).
 * 2. Run setup() once to create the time-driven trigger.
 * 3. Apps Script will email you when a feed has a new item.
 */

const NOTIFY_EMAIL = Session.getActiveUser().getEmail();
const PROP_PREFIX = 'seen_';
const SEEN_ID_CAP = 300; // stay well under Apps Script's 9KB per-property limit

function checkFeeds() {
  const props = PropertiesService.getScriptProperties();
  const matches = [];

  FEEDS.forEach(feed => {
    let items;
    try {
      items = fetchFeedItems(feed.url);
    } catch (e) {
      Logger.log('Failed to fetch %s: %s', feed.url, e);
      return;
    }

    const propKey = PROP_PREFIX + Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, feed.url)
    );
    const prevIds = JSON.parse(props.getProperty(propKey) || '[]');
    const seenIds = new Set(prevIds);
    const newItems = items.filter(item => !seenIds.has(item.id));

    // First run for this feed: just record state, don't spam an inbox.
    const isFirstRun = seenIds.size === 0 && newItems.length > 0;
    if (!isFirstRun) {
      newItems
        .filter(item => matchesKeywords(item, feed.keywords))
        .forEach(item => matches.push({ feedUrl: feed.url, item }));
    }

    if (newItems.length) {
      // Keep every id still present in the feed (so items don't fall out of
      // the seen list just by scrolling past the top N and later resurfacing
      // due to an edit), then pad with older seen ids up to the cap.
      const currentIds = items.map(i => i.id);
      const currentIdSet = new Set(currentIds);
      const staleIds = prevIds.filter(id => !currentIdSet.has(id));
      const updatedIds = currentIds.concat(staleIds).slice(0, SEEN_ID_CAP);
      props.setProperty(propKey, JSON.stringify(updatedIds));
    }
  });

  if (matches.length) sendDigest(matches);
}

function fetchFeedItems(feedUrl) {
  const xml = UrlFetchApp.fetch(feedUrl, { muteHttpExceptions: true }).getContentText();
  const doc = XmlService.parse(xml);
  const root = doc.getRootElement();

  // RSS 2.0: rss > channel > item. Atom: feed > entry.
  const channel = root.getChild('channel');
  const entries = channel
    ? channel.getChildren('item')
    : root.getChildren('entry', root.getNamespace());

  return entries.map(entry => {
    const isAtom = !channel;
    const title = getChildText(entry, 'title', isAtom);
    const link = isAtom
      ? (entry.getChild('link', entry.getNamespace())
          ? entry.getChild('link', entry.getNamespace()).getAttribute('href').getValue()
          : '')
      : getChildText(entry, 'link', false);
    const summary = isAtom
      ? getChildText(entry, 'summary', true) || getChildText(entry, 'content', true)
      : getChildText(entry, 'description', false);
    const id = getChildText(entry, isAtom ? 'id' : 'guid', isAtom) || link || title;

    return { id, title, link, summary: summary || '' };
  });
}

function getChildText(entry, name, isAtom) {
  const el = isAtom ? entry.getChild(name, entry.getNamespace()) : entry.getChild(name);
  return el ? el.getText() : '';
}

function matchesKeywords(item, keywords) {
  if (!keywords || !keywords.length) return true;
  const haystack = (item.title + ' ' + item.summary).toLowerCase();
  return keywords.some(k => haystack.includes(k.toLowerCase()));
}

function sendDigest(matches) {
  const subject = matches.length === 1
    ? 'RSS update: ' + matches[0].item.title
    : 'RSS updates: ' + matches.length + ' new items';

  const byFeed = new Map();
  matches.forEach(m => {
    if (!byFeed.has(m.feedUrl)) byFeed.set(m.feedUrl, []);
    byFeed.get(m.feedUrl).push(m.item);
  });

  const body = Array.from(byFeed.entries())
    .map(([feedUrl, items]) => {
      const itemLines = items.map(item => item.title + '\n' + item.link).join('\n\n');
      return feedUrl + '\n\n' + itemLines;
    })
    .join('\n\n---\n\n');

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

// Run once manually to install the polling trigger.
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkFeeds') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkFeeds').timeBased().everyMinutes(30).create();
}
