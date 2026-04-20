let allLeads = [];
let runStatusInterval = null;
let emailDraftsByKey = new Map();
let generatingKeys = new Set();
let selectedEmailDraftKey = '';

const tabHeaderMeta = {
  logs: { eyebrow: 'Pipeline', title: 'Live Logs' },
  leads: { eyebrow: 'Database', title: 'Leads Database' },
  emails: { eyebrow: 'Outreach', title: 'Email Drafts' },
};

function leadKeyFromRow(lead) {
  return `${(lead['Business Name'] || '').toLowerCase().trim()}|${(lead['Address'] || '')
    .toLowerCase()
    .trim()}`;
}

async function loadLeads() {
  const res = await fetch('/api/leads');
  allLeads = await res.json();
  renderStats();
  applyFiltersAndSort();
}

async function loadEmails() {
  await fetch('/api/emails');
  renderEmailWorkspace();
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
  applyFiltersAndSort();
  if (!selectedEmailDraftKey || !emailDraftsByKey.has(selectedEmailDraftKey)) {
    selectedEmailDraftKey = emailDraftsByKey.size ? Array.from(emailDraftsByKey.keys())[0] : '';
  }
  renderEmailWorkspace();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inferRecipient(draft) {
  const base = (draft.businessName || 'business')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `info@${base || 'business'}.example`;
}

function buildGmailComposeUrl({ to, subject, body }) {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: to || '',
    su: subject || '',
    body: body || '',
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function draftListHtml(drafts, selectedKey) {
  return drafts
    .map((draft) => {
      const key = `${(draft.businessName || '').toLowerCase().trim()}|${(draft.address || '').toLowerCase().trim()}`;
      const activeClass = key === selectedKey ? 'draft-item active' : 'draft-item';
      return `
        <button class="${activeClass}" data-draft-key="${encodeURIComponent(key)}" type="button">
          <span class="draft-item-name">${escapeHtml(draft.businessName)}</span>
          <span class="draft-item-meta">${escapeHtml(draft.address || '')}</span>
          <span class="draft-item-quality">MANUAL REVIEW</span>
        </button>
      `;
    })
    .join('');
}

function renderEmailWorkspace() {
  const container = document.getElementById('emails-content');
  if (!container) return;

  const drafts = Array.from(emailDraftsByKey.values()).sort((a, b) =>
    (a.businessName || '').localeCompare(b.businessName || '')
  );

  if (!drafts.length) {
    container.innerHTML = `
      <div class="email-empty-shell">
        <h4>Generate Email</h4>
        <p class="email-empty">No email drafts yet. Generate one from the Leads Database tab.</p>
      </div>
    `;
    return;
  }

  if (!selectedEmailDraftKey || !emailDraftsByKey.has(selectedEmailDraftKey)) {
    selectedEmailDraftKey = `${(drafts[0].businessName || '').toLowerCase().trim()}|${(drafts[0].address || '')
      .toLowerCase()
      .trim()}`;
  }

  const selectedDraft = emailDraftsByKey.get(selectedEmailDraftKey) || drafts[0];
  const selectedLead = allLeads.find((lead) => leadKeyFromRow(lead) === selectedEmailDraftKey) || {};
  const recipient = inferRecipient(selectedDraft);

  container.innerHTML = `
    <div class="email-workspace">
      <div class="email-workspace-head">
        <h4>Generate Email</h4>
        <div class="email-top-actions">
          <button type="button" class="email-secondary-btn" data-email-action="discard">Discard</button>
          <button type="button" class="email-primary-btn" data-email-action="open-gmail">Open in Gmail</button>
        </div>
      </div>

      <div class="email-main-grid">
        <aside class="email-intelligence-panel">
          <div class="email-list-head">Lead Intelligence</div>
          <div class="draft-list">${draftListHtml(drafts, selectedEmailDraftKey)}</div>
          <div class="lead-intel-card">
            <h5>${escapeHtml(selectedDraft.businessName)}</h5>
            <span class="lead-quality-pill is-mediocre">
              MANUAL REVIEW
            </span>
            <p><strong>Address:</strong> ${escapeHtml(selectedDraft.address || 'Unknown')}</p>
            <p><strong>Phone:</strong> ${escapeHtml(selectedLead['Phone'] || 'N/A')}</p>
            <p><strong>Website:</strong> ${selectedLead['Website URL'] ? `<a href="${escapeHtml(selectedLead['Website URL'])}" target="_blank">Visit</a>` : 'None found'}</p>
          </div>
        </aside>

        <section class="email-composition-panel">
          <div class="email-list-head">Email Composition</div>
          <label>Recipient</label>
          <input id="email-recipient-input" type="email" value="${escapeHtml(recipient)}" />
          <label>Subject</label>
          <input type="text" readonly value="${escapeHtml(selectedDraft.subject || '')}" />
          <label>Body</label>
          <textarea readonly>${escapeHtml(selectedDraft.body || '')}</textarea>
          <div class="email-bottom-actions">
            <button type="button" class="email-secondary-btn" data-email-action="copy">Copy to Clipboard</button>
            <button type="button" class="email-primary-btn" data-email-action="open-gmail">Open in Gmail</button>
          </div>
        </section>
      </div>
    </div>
  `;
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
      body: JSON.stringify({ mode: 'scrape' }),
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
  const withWebsite = allLeads.filter((l) => (l['Website URL'] || '').trim()).length;
  const withoutWebsite = allLeads.length - withWebsite;
  document.getElementById('stats').textContent =
    `${allLeads.length} leads · ${withWebsite} with website · ${withoutWebsite} missing website`;
}

function renderLeads(leads) {
  const tbody = document.getElementById('leads-body');
  const leadsCount = document.getElementById('leads-count');
  if (leadsCount) {
    leadsCount.textContent = `${leads.length} visible leads`;
  }
  if (!leads.length) {
    tbody.innerHTML = '<tr><td colspan="6">No leads found. Run the pipeline first.</td></tr>';
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
      <td>${lead['Google Maps Link'] ? `<a href="${lead['Google Maps Link']}" target="_blank">Maps</a>` : '—'}</td>
      <td>${emailActionHtml(lead)}${trashActionHtml(lead)}</td>
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

function trashActionHtml(lead) {
  const key = leadKeyFromRow(lead);
  return `
    <button class="trash-lead-btn" data-trash-key="${encodeURIComponent(key)}">
      Trash
    </button>
  `;
}

function attachEmailHandlers() {
  document.querySelectorAll('.email-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = decodeURIComponent(btn.dataset.key || '');
      const lead = allLeads.find((row) => leadKeyFromRow(row) === key);
      if (!lead) return;
      generatingKeys.add(key);
      applyFiltersAndSort();
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
        await loadEmails();
      } catch (err) {
        document.getElementById('run-status').textContent = err.message;
      } finally {
        generatingKeys.delete(key);
        applyFiltersAndSort();
      }
    });
  });

  document.querySelectorAll('.trash-lead-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = decodeURIComponent(btn.dataset.trashKey || '');
      const lead = allLeads.find((row) => leadKeyFromRow(row) === key);
      if (!lead) return;
      const confirmed = window.confirm(`Move "${lead['Business Name']}" to trash?`);
      if (!confirmed) return;
      try {
        const res = await fetch('/api/leads/trash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: lead['Business Name'] || '',
            address: lead['Address'] || '',
          }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to trash lead.');
        }
        allLeads = allLeads.filter((row) => leadKeyFromRow(row) !== key);
        emailDraftsByKey.delete(key);
        if (selectedEmailDraftKey === key) {
          selectedEmailDraftKey = emailDraftsByKey.size ? Array.from(emailDraftsByKey.keys())[0] : '';
        }
        applyFiltersAndSort();
        renderStats();
        renderEmailWorkspace();
        document.getElementById('run-status').textContent = 'Lead moved to trash.';
      } catch (err) {
        document.getElementById('run-status').textContent = err.message;
      }
    });
  });
}

function applyFiltersAndSort() {
  const search = document.getElementById('search').value.toLowerCase();
  const filtered = allLeads.filter((lead) => {
    const matchesSearch =
      !search ||
      (lead['Business Name'] || '').toLowerCase().includes(search) ||
      (lead['Address'] || '').toLowerCase().includes(search);
    return matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) =>
    (a['Business Name'] || '').localeCompare(b['Business Name'] || '')
  );

  renderLeads(sorted);
}

function updateHeaderForTab(tab) {
  const meta = tabHeaderMeta[tab] || { eyebrow: 'Dashboard', title: 'LeadArch Operations' };
  const eyebrowEl = document.getElementById('topbar-eyebrow');
  const titleEl = document.getElementById('topbar-title');
  if (eyebrowEl) eyebrowEl.textContent = meta.eyebrow;
  if (titleEl) titleEl.textContent = meta.title;
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((t) => t.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-tab`).classList.remove('hidden');
    updateHeaderForTab(btn.dataset.tab);
    if (btn.dataset.tab === 'emails') loadEmails();
  });
});

document.getElementById('search').addEventListener('input', applyFiltersAndSort);
document.getElementById('run-pipeline-btn').addEventListener('click', triggerRun);
document.getElementById('emails-content').addEventListener('click', async (event) => {
  const draftButton = event.target.closest('[data-draft-key]');
  if (draftButton) {
    selectedEmailDraftKey = decodeURIComponent(draftButton.dataset.draftKey || '');
    renderEmailWorkspace();
    return;
  }

  const actionButton = event.target.closest('[data-email-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.emailAction;
  if (action === 'copy') {
    const selectedDraft = emailDraftsByKey.get(selectedEmailDraftKey);
    if (!selectedDraft) return;
    const payload = `Subject: ${selectedDraft.subject || ''}\n\n${selectedDraft.body || ''}`;
    try {
      await navigator.clipboard.writeText(payload);
      document.getElementById('run-status').textContent = 'Email copied to clipboard.';
    } catch {
      document.getElementById('run-status').textContent = 'Failed to copy email.';
    }
  } else if (action === 'discard') {
    if (!selectedEmailDraftKey) return;
    emailDraftsByKey.delete(selectedEmailDraftKey);
    selectedEmailDraftKey = emailDraftsByKey.size ? Array.from(emailDraftsByKey.keys())[0] : '';
    renderEmailWorkspace();
    document.getElementById('run-status').textContent = 'Draft removed from view (local only).';
  } else if (action === 'open-gmail') {
    const selectedDraft = emailDraftsByKey.get(selectedEmailDraftKey);
    if (!selectedDraft) return;
    const recipientInput = document.getElementById('email-recipient-input');
    const to = (recipientInput?.value || '').trim();
    if (!to) {
      document.getElementById('run-status').textContent = 'Recipient is required.';
      return;
    }
    const gmailUrl = buildGmailComposeUrl({
      to,
      subject: selectedDraft.subject || '',
      body: selectedDraft.body || '',
    });
    const popup = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    if (!popup) {
      document.getElementById('run-status').textContent =
        'Popup blocked. Allow popups for this site to open Gmail compose.';
      return;
    }
    document.getElementById('run-status').textContent = 'Opened Gmail compose in a new tab.';
  }
});

Promise.all([loadLeads(), loadEmailDrafts()]).then(() => {
  applyFiltersAndSort();
  renderEmailWorkspace();
});
updateHeaderForTab('logs');
loadRunStatus();
