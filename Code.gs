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
    const seenIds = new Set(JSON.parse(props.getProperty(propKey) || '[]'));
    const newItems = items.filter(item => !seenIds.has(item.id));

    // First run for this feed: just record state, don't spam an inbox.
    if (seenIds.size === 0 && newItems.length) {
      props.setProperty(propKey, JSON.stringify(items.slice(0, 50).map(i => i.id)));
      return;
    }

    newItems
      .filter(item => matchesKeywords(item, feed.keywords))
      .forEach(item => matches.push({ feedUrl: feed.url, item }));

    if (newItems.length) {
      const updatedIds = items.slice(0, 50).map(i => i.id);
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

  const body = matches
    .map(m => m.item.title + '\n' + m.item.link + '\nFrom feed: ' + m.feedUrl)
    .join('\n\n');

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

// Run once manually to install the polling trigger.
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkFeeds') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkFeeds').timeBased().everyMinutes(30).create();
}
