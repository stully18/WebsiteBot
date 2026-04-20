module.exports = {
  searchTerms: [
    'dentist near Princeton NJ',
    'real estate agent near Ewing NJ',
    'coffee shop near Trenton NJ',
    'personal trainer near Princeton NJ',
    'salon near Ewing NJ',
    'plumber near Trenton NJ',
    'restaurant near Princeton NJ',
    'accountant near Ewing NJ',
    'gym near Trenton NJ',
    'contractor near Princeton NJ',
  ],
  // Chains/franchises to filter out (case-insensitive substring match on business name)
  chainKeywords: [
    'mcdonald', 'starbucks', 'subway', 'dunkin', 'cvs', 'walgreens',
    'target', 'walmart', 'home depot', 'lowes', 'burger king', 'wendy',
    'chick-fil', 'domino', 'pizza hut', 'h&r block', 'great clips',
  ],
  maxResultsPerTerm: 20,
  outputDir: './output',
};
