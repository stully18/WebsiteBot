const { filterLeadsForFocus } = require('../../utils/lead-filters');

describe('filterLeadsForFocus', () => {
  const rules = {
    requireWebsite: true,
    excludeNameKeywords: ['realtor', 'planet fitness'],
    excludeWebsiteKeywords: ['realtor.com', 'zillow.com'],
  };

  it('keeps only leads that match focus criteria', () => {
    const leads = [
      { name: 'Local Masonry Co', website: 'https://localmasonry.example.com' },
      { name: 'Local Realtor Group', website: 'https://localrealtor.example.com' },
      { name: 'No Site Business', website: '' },
      { name: 'Another Business', website: 'https://www.zillow.com/agent/foo' },
    ];

    const result = filterLeadsForFocus(leads, rules);

    expect(result.kept).toHaveLength(1);
    expect(result.kept[0].name).toBe('Local Masonry Co');
    expect(result.excluded).toHaveLength(3);
    expect(result.excludedReasonCounts).toEqual({
      excluded_name_pattern: 1,
      missing_website: 1,
      excluded_website_pattern: 1,
    });
  });

  it('handles missing rules safely', () => {
    const leads = [{ name: 'Any Business', website: '' }];
    const result = filterLeadsForFocus(leads);
    expect(result.kept).toHaveLength(1);
    expect(result.excluded).toHaveLength(0);
  });
});
