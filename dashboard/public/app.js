let allLeads = [];

async function loadLeads() {
  const res = await fetch('/api/leads');
  allLeads = await res.json();
  renderStats();
  renderLeads(allLeads);
}

async function loadEmails() {
  const res = await fetch('/api/emails');
  const { content } = await res.json();
  document.getElementById('emails-content').textContent =
    content || 'No email drafts found. Run node index.js first.';
}

function renderStats() {
  const noWebsite = allLeads.filter((l) => l['Website Quality'] === 'no website').length;
  const poor = allLeads.filter((l) => l['Website Quality'] === 'poor').length;
  document.getElementById('stats').textContent =
    `${allLeads.length} leads · ${noWebsite} no website · ${poor} poor`;
}

function badgeHtml(quality) {
  const cls = quality === 'no website' ? 'badge-no-website' : `badge-${quality}`;
  return `<span class="badge ${cls}">${quality}</span>`;
}

function renderLeads(leads) {
  const tbody = document.getElementById('leads-body');
  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="6">No leads found. Run node index.js first.</td></tr>';
    return;
  }
  tbody.innerHTML = leads
    .map(
      (lead) => `
    <tr>
      <td>${lead['Business Name'] || ''}</td>
      <td>${lead['Address'] || ''}</td>
      <td>${lead['Phone'] || ''}</td>
      <td>${lead['Website URL'] ? `<a href="${lead['Website URL']}" target="_blank">Visit</a>` : '—'}</td>
      <td>${badgeHtml(lead['Website Quality'] || '')}</td>
      <td>${lead['Google Maps Link'] ? `<a href="${lead['Google Maps Link']}" target="_blank">Maps</a>` : '—'}</td>
    </tr>`
    )
    .join('');
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const quality = document.getElementById('quality-filter').value;
  const filtered = allLeads.filter((lead) => {
    const matchesSearch =
      !search ||
      (lead['Business Name'] || '').toLowerCase().includes(search) ||
      (lead['Address'] || '').toLowerCase().includes(search);
    const matchesQuality = !quality || lead['Website Quality'] === quality;
    return matchesSearch && matchesQuality;
  });
  renderLeads(filtered);
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-tab`).classList.remove('hidden');
    if (btn.dataset.tab === 'emails') loadEmails();
  });
});

document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('quality-filter').addEventListener('change', applyFilters);

loadLeads();
