let allLeads = [];
let runStatusInterval = null;
let emailDraftsByKey = new Map();
let generatingKeys = new Set();

function leadKeyFromRow(lead) {
  return `${(lead['Business Name'] || '').toLowerCase().trim()}|${(lead['Address'] || '')
    .toLowerCase()
    .trim()}`;
}

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

async function loadEmailDrafts() {
  const res = await fetch('/api/email-drafts');
  const drafts = await res.json();
  emailDraftsByKey = new Map(
    drafts.map((draft) => [
      `${(draft.businessName || '').toLowerCase().trim()}|${(draft.address || '').toLowerCase().trim()}`,
      draft,
    ])
  );
}

function formatRunStatus(runState) {
  const modeLabel = runState.mode ? ` (${runState.mode})` : '';
  if (runState.running) return `Running${modeLabel}...`;
  if (runState.finishedAt && runState.exitCode === 0) return `Completed successfully${modeLabel}`;
  if (runState.finishedAt && runState.exitCode !== null) return `Failed${modeLabel} (exit ${runState.exitCode})`;
  return 'Idle';
}

function renderRunState(runState) {
  const runButton = document.getElementById('run-pipeline-btn');
  const runStatus = document.getElementById('run-status');
  const runLogs = document.getElementById('run-logs');
  runButton.disabled = runState.running;
  runStatus.textContent = formatRunStatus(runState);
  runLogs.textContent = runState.logs.length ? runState.logs.join('\n') : 'No runs yet.';
  runLogs.scrollTop = runLogs.scrollHeight;
}

async function loadRunStatus() {
  const res = await fetch('/api/run-status');
  const runState = await res.json();
  renderRunState(runState);
  if (!runState.running && runStatusInterval) {
    clearInterval(runStatusInterval);
    runStatusInterval = null;
    await loadLeads();
    await loadEmailDrafts();
    renderLeads(allLeads);
    loadEmails();
  }
}

async function triggerRun() {
  const runButton = document.getElementById('run-pipeline-btn');
  runButton.disabled = true;
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'full' }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || 'Failed to start pipeline.');
    }
    await loadRunStatus();
    if (!runStatusInterval) {
      runStatusInterval = setInterval(loadRunStatus, 1000);
    }
  } catch (err) {
    document.getElementById('run-status').textContent = err.message;
    runButton.disabled = false;
  }
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
    tbody.innerHTML = '<tr><td colspan="7">No leads found. Run the pipeline first.</td></tr>';
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
      <td>${emailActionHtml(lead)}</td>
    </tr>`
    )
    .join('');
  attachEmailHandlers();
}

function emailActionHtml(lead) {
  const key = leadKeyFromRow(lead);
  const hasDraft = emailDraftsByKey.has(key);
  const generating = generatingKeys.has(key);
  const buttonLabel = generating ? 'Generating...' : hasDraft ? 'Regenerate' : 'Generate';
  const statusLabel = hasDraft ? 'Draft saved' : 'No draft';
  return `
    <button class="email-btn" data-key="${encodeURIComponent(key)}" ${generating ? 'disabled' : ''}>
      ${buttonLabel}
    </button>
    <div class="email-status">${statusLabel}</div>
  `;
}

function attachEmailHandlers() {
  document.querySelectorAll('.email-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = decodeURIComponent(btn.dataset.key || '');
      const lead = allLeads.find((row) => leadKeyFromRow(row) === key);
      if (!lead) return;
      generatingKeys.add(key);
      renderLeads(allLeads);
      try {
        const res = await fetch('/api/generate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: lead['Business Name'] || '',
            address: lead['Address'] || '',
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to generate email.');
        }
        await loadEmailDrafts();
        renderLeads(allLeads);
        await loadEmails();
      } catch (err) {
        document.getElementById('run-status').textContent = err.message;
      } finally {
        generatingKeys.delete(key);
        renderLeads(allLeads);
      }
    });
  });
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
document.getElementById('run-pipeline-btn').addEventListener('click', triggerRun);

Promise.all([loadLeads(), loadEmailDrafts()]).then(() => {
  renderLeads(allLeads);
});
loadRunStatus();
