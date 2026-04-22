const fs = require('fs');
const path = require('path');

const USER_CONFIG_PATH = path.join(__dirname, 'user-config.json');

const DEFAULT_CONFIG = {
  location: { query: 'Princeton, NJ', radiusMiles: 10 },
  categories: [
    'landscaping',
    'general contractor',
    'roofing',
    'plumbing',
    'electrician',
    'hvac',
    'remodeling',
    'masonry',
    'painting',
    'flooring',
  ],
  templates: {
    email: {
      subject: 'Free website for {{businessName}}',
      body: [
        'Hi {{businessName}} team,',
        '',
        "I came across your business and noticed your website could use a refresh. I'm {{name}}, {{role}}, and I'm building out my portfolio.",
        '',
        "I'd love to build you a brand-new, modern website completely for free. The only cost is hosting — around $10–20/month. No upfront cost, no obligation, and you keep full ownership.",
        '',
        "Happy to send over some ideas or hop on a quick call if you're interested.",
        '',
        'Best,',
        '{{name}}',
        '{{portfolio}}',
      ].join('\n'),
    },
    dm: {
      body: [
        "Hey {{shortName}} — I'm {{name}}, {{role}}.",
        '',
        "I'm building my portfolio and would love to build you a modern website completely for free. The only cost is hosting (~$10–20/month).",
        '',
        'I put together a quick mockup — want me to send it over?',
        '',
        'Portfolio: {{portfolio}}',
        'No pressure at all.',
      ].join('\n'),
    },
  },
  outreach: {
    name: 'Your Name',
    role: 'a web developer',
    portfolio: 'yourportfolio.com',
  },
};

function loadConfig() {
  let userConfig = {};
  if (fs.existsSync(USER_CONFIG_PATH)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, 'utf8'));
    } catch {
      // fall through to defaults
    }
  }

  const location = userConfig.location || DEFAULT_CONFIG.location;
  const categories =
    Array.isArray(userConfig.categories) && userConfig.categories.length
      ? userConfig.categories
      : DEFAULT_CONFIG.categories;
  const templates = userConfig.templates || DEFAULT_CONFIG.templates;
  const outreach = userConfig.outreach || DEFAULT_CONFIG.outreach;

  const radius = Number(location.radiusMiles) || 10;
  const maxResultsPerTerm = radius <= 5 ? 10 : radius <= 15 ? 15 : radius <= 30 ? 20 : 30;
  const searchTerms = categories.map((cat) => `${cat} near ${location.query}`);

  return { location, categories, templates, outreach, searchTerms, maxResultsPerTerm };
}

function ensureUserConfig() {
  if (!fs.existsSync(USER_CONFIG_PATH)) {
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  }
}

const focusFilters = {
  requireWebsite: true,
  excludeNameKeywords: [
    'realtor',
    'realtors',
    'real estate',
    'brokerage',
    'property management',
    'mls',
    'listing',
    'century 21',
    'berkshire hathaway',
    're/max',
    'kw ',
    'keller williams',
    'planet fitness',
    'orangetheory',
    'lifetime',
    'anytime fitness',
    'crunch fitness',
    'd1 training',
    'ferguson',
    'home depot',
    'lowes',
    'walmart',
    'target',
  ],
  excludeWebsiteKeywords: [
    'realtor.com',
    'zillow.com',
    'redfin.com',
    'loopnet.com',
    'apartments.com',
    'homes.com',
    'trulia.com',
    'yelp.com',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'maps.google.',
    'google.com/maps',
  ],
};

const chainKeywords = [
  'mcdonald', 'starbucks', 'subway', 'dunkin', 'cvs', 'walgreens',
  'target', 'walmart', 'home depot', 'lowes', 'burger king', 'wendy',
  'chick-fil', 'domino', 'pizza hut', 'h&r block', 'great clips',
];

module.exports = {
  loadConfig,
  ensureUserConfig,
  DEFAULT_CONFIG,
  USER_CONFIG_PATH,
  focusFilters,
  chainKeywords,
  outputDir: './output',
};
