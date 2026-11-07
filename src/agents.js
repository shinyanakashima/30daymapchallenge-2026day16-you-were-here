// User-Agent classification. The raw User-Agent string is never stored:
// only the name of the matched agent goes into the database.

// AI crawlers and AI assistants that identify themselves in the User-Agent.
// Order matters only where one token contains another.
export const AI_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'meta-externalfetcher',
  'FacebookBot',
  'Google-CloudVertexBot',
  'Google-Extended',
  'Gemini-Deep-Research',
  'Applebot-Extended',
  'cohere-ai',
  'cohere-training-data-crawler',
  'MistralAI-User',
  'DuckAssistBot',
  'YouBot',
  'AI2Bot',
  'Diffbot',
  'PetalBot',
  'Timpibot',
  'ImagesiftBot',
  'Omgilibot',
  'Kangaroo Bot',
  'PanguBot',
];

// Other machines. The first matching pattern gives the agent name.
const BOT_PATTERNS = [
  ['Googlebot', /googlebot/i],
  ['bingbot', /bingbot/i],
  ['Applebot', /applebot/i],
  ['YandexBot', /yandex/i],
  ['Baiduspider', /baiduspider/i],
  ['DuckDuckBot', /duckduckbot/i],
  ['facebookexternalhit', /facebookexternalhit/i],
  ['Twitterbot', /twitterbot/i],
  ['Slackbot', /slack/i],
  ['Discordbot', /discordbot/i],
  ['LinkedInBot', /linkedinbot/i],
  ['TelegramBot', /telegrambot/i],
  ['WhatsApp', /whatsapp/i],
  ['Bluesky', /bluesky/i],
  ['Mastodon', /mastodon/i],
  ['AhrefsBot', /ahrefs/i],
  ['SemrushBot', /semrush/i],
  ['HeadlessChrome', /headlesschrome/i],
  ['curl', /\bcurl\//i],
  ['Wget', /\bwget\//i],
  ['python-requests', /python-requests/i],
  ['python', /python|aiohttp|httpx/i],
  ['Go-http-client', /go-http-client/i],
  ['node', /node-fetch|undici|axios|^node/i],
  ['Java', /^java\/|okhttp|apache-httpclient/i],
  ['other bot', /bot\b|bot\/|crawler|crawl|spider|preview|scraper|fetch|monitor|uptime|lighthouse|headless/i],
];

const AI_LOWER = AI_AGENTS.map((a) => [a, a.toLowerCase()]);

/** @returns {{kind: 'human'|'bot'|'ai_bot', agent: string}} */
export function classify(ua) {
  const s = (ua || '').trim();
  if (!s) return { kind: 'bot', agent: 'no user-agent' };
  const lower = s.toLowerCase();
  // Prefer the longest AI token that matches (e.g. "Claude-SearchBot" over "ClaudeBot").
  let ai = '';
  for (const [name, low] of AI_LOWER) {
    if (lower.includes(low) && low.length > ai.length) ai = name;
  }
  if (ai) return { kind: 'ai_bot', agent: ai };
  for (const [name, re] of BOT_PATTERNS) {
    if (re.test(s)) return { kind: 'bot', agent: name };
  }
  return { kind: 'human', agent: '' };
}
