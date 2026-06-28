// Navigation tabs logic
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active from other btns
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    // Add active to current
    btn.classList.add('active');

    // Switch panels
    const target = btn.getAttribute('data-target');
    document.querySelectorAll('.dashboard-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(target).classList.add('active');

    // Set page header title
    document.querySelector('.top-header h2').innerText = btn.innerText.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();

    // Trigger data loads
    if (target === 'panel-overview') fetchStats();
    if (target === 'panel-packages') fetchPackages();
    if (target === 'panel-keys') fetchKeys();
    if (target === 'panel-addresses') fetchAddresses();
    if (target === 'panel-broadcast') fetchBroadcasts();
    if (target === 'panel-logs') fetchLogs();
    if (target === 'panel-coupons') fetchCoupons();
    if (target === 'panel-feedback') fetchFeedback();
  });
});

// Initial load
window.addEventListener('DOMContentLoaded', () => {
  fetchStats();
});

// Modals management helpers
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

/**
 * Robust API & Database Check Helper
 * Checks if Supabase has uninitialized tables or connection errors, toggling the warning banner.
 */
function checkRequestError(data) {
  const banner = document.getElementById('db-warning-banner');
  if (data && data.error) {
    if (banner) {
      banner.classList.remove('hidden');
      if (data.error === 'database_not_initialized') {
        banner.querySelector('h4').innerText = '⚠️ Datenbank-Schema nicht initialisiert';
        banner.querySelector('p').innerHTML = `
          Das SQL-Schema wurde noch nicht in Supabase ausgeführt. Bitte führe das SQL-Skript 
          <code style="background-color:var(--bg-tertiary); padding:2px 6px; border-radius:4px; font-family:monospace;">database/schema.sql</code> 
          im SQL Editor deiner Supabase Console aus, um das System vollständig zu aktivieren.
        `;
      } else {
        banner.querySelector('h4').innerText = '⚠️ System- oder Verbindungsfehler';
        banner.querySelector('p').innerHTML = `
          Es ist ein Fehler aufgetreten: 
          <code style="background-color:var(--bg-tertiary); padding:2px 6px; border-radius:4px; font-family:monospace;">${data.error}</code>.
          <br><br>
          Bitte überprüfe die Verbindung zu Supabase und deine lokale Konfiguration in <code style="font-family:monospace;">.env.local</code>.
        `;
      }
    }
    return true; // Stop execution
  } else {
    if (banner) {
      banner.classList.add('hidden');
    }
  }
  return false;
}

// ----------------- OVERVIEW SECTION -----------------

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    
    // Check if database schema is missing or connection failed
    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    // Load stats
    document.getElementById('stat-users').innerText = data.stats.users;
    document.getElementById('stat-active').innerText = data.stats.activeSubscriptions;
    document.getElementById('stat-revenue').innerText = `${data.stats.revenueEur.toFixed(2)} EUR`;
    document.getElementById('stat-keys').innerText = data.stats.keys.usable;

    // Load recent subscriptions
    const recentBody = document.querySelector('#table-recent-subs tbody');
    recentBody.innerHTML = '';
    
    if (data.recentSubscriptions.length === 0) {
      recentBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Keine Abonnements vorhanden.</td></tr>`;
    } else {
      data.recentSubscriptions.forEach(sub => {
        const date = new Date(sub.created_at).toLocaleDateString('de-DE');
        const emailEscaped = (sub.spotify_email || '').replace(/'/g, "\\'");
        recentBody.innerHTML += `
          <tr>
            <td>\`${sub.users?.telegram_id || 'N/A'}\`</td>
            <td>${sub.spotify_email || 'Noch keine'}</td>
            <td>${sub.packages?.name || 'N/A'}</td>
            <td><span class="status-badge ${sub.status}">${sub.status}</span></td>
            <td>${date}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="editSubCredentials('${sub.id}', '${emailEscaped}', '${sub.status}', '${sub.expires_at || ''}')">✏️ Edit</button>
              ${sub.status === 'failed' || sub.status === 'activating' ? `<button class="btn btn-primary btn-sm" onclick="retryUpgrade('${sub.id}')">🔄 Retry</button>` : ''}
            </td>
          </tr>
        `;
      });
    }

    // Load unresolved logs
    const overviewLogsList = document.getElementById('overview-logs-list');
    overviewLogsList.innerHTML = '';
    
    if (data.unresolvedLogs.length === 0) {
      overviewLogsList.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding-top:20px;">Keine ungelösten Fehlermeldungen! 🎉</p>`;
    } else {
      data.unresolvedLogs.forEach(log => {
        const time = new Date(log.created_at).toLocaleString('de-DE');
        overviewLogsList.innerHTML += `
          <div class="log-item ${log.level.toLowerCase()}">
            <div class="log-header">
              <span>Component: ${log.component}</span>
              <span class="log-time">${time}</span>
            </div>
            <div class="log-body">${log.message}</div>
            <div class="log-footer">
              <button class="btn btn-secondary btn-sm" onclick="resolveLog('${log.id}')">Mark Resolved</button>
            </div>
          </div>
        `;
      });
    }
    fetchAdminDecisions();
  } catch (err) {
    console.error(err);
  }
}

async function fetchAdminDecisions() {
  try {
    const res = await fetch('/api/admin/decisions');
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const container = document.getElementById('admin-decisions-box');
    const tbody = document.querySelector('#table-admin-decisions tbody');
    if (!container || !tbody) return;
    
    tbody.innerHTML = '';

    if (data.length === 0) {
      container.style.display = 'none';
    } else {
      container.style.display = 'block';
      data.forEach(user => {
        tbody.innerHTML += `
          <tr>
            <td><code>${user.telegram_id}</code></td>
            <td>${user.username || 'N/A'}</td>
            <td><span class="status-badge failed">${user.lockout_count} / 3 Sperren</span></td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="tolerateUser('${user.id}')" style="margin-right: 5px;">😇 Tolerieren</button>
              <button class="btn btn-danger btn-sm" onclick="banUser('${user.id}')">🚫 Ausschließen</button>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    console.error('Failed to fetch admin decisions:', err);
  }
}

async function banUser(userId) {
  if (!confirm('Diesen User gänzlich ausschließen (Bannen)? Der User kann keine weiteren Checkouts mehr erstellen.')) return;
  try {
    const res = await fetch(`/api/admin/decisions/${userId}/ban`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    alert('User erfolgreich ausgeschlossen!');
    fetchStats();
  } catch (err) {
    alert(`Fehler: ${err.message}`);
  }
}

async function tolerateUser(userId) {
  if (!confirm('Diesen User noch einmal tolerieren? Lockout-Zähler und Sperren werden zurückgesetzt.')) return;
  try {
    const res = await fetch(`/api/admin/decisions/${userId}/tolerate`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    alert('User erfolgreich toleriert. Lockout-Zähler wurde zurückgesetzt.');
    fetchStats();
  } catch (err) {
    alert(`Fehler: ${err.message}`);
  }
}

async function resolveLog(id) {
  if (!confirm('Mark log as resolved?')) return;
  try {
    const res = await fetch(`/api/logs/resolve/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchStats();
    if (document.getElementById('panel-logs').classList.contains('active')) {
      fetchLogs();
    }
  } catch (err) {
    alert(`Failed to resolve log: ${err.message}`);
  }
}

async function retryUpgrade(subId) {
  if (!confirm('Upgrade manuell anstoßen/wiederholen?')) return;
  try {
    const res = await fetch(`/api/subscriptions/retry/${subId}`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (data.success) {
      alert('Upgrade erfolgreich durchgeführt!');
    } else {
      alert(`Upgrade fehlgeschlagen: ${data.message}`);
    }
    fetchStats();
  } catch (err) {
    alert(`Failed to retry upgrade: ${err.message}`);
  }
}

function editSubCredentials(id, email, status, expiresAt) {
  document.getElementById('edit-sub-id').value = id;
  document.getElementById('edit-sub-email').value = email || '';
  document.getElementById('edit-sub-password').value = '';
  document.getElementById('edit-sub-status').value = status || 'pending_payment';
  
  if (expiresAt) {
    // Format to YYYY-MM-DDTHH:MM local time for datetime-local input
    const date = new Date(expiresAt);
    const tzoffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
    document.getElementById('edit-sub-expires').value = localISOTime;
  } else {
    document.getElementById('edit-sub-expires').value = '';
  }
  
  openModal('modal-edit-sub');
}

async function submitEditSubForm(e) {
  e.preventDefault();
  const id = document.getElementById('edit-sub-id').value;
  const email = document.getElementById('edit-sub-email').value;
  const password = document.getElementById('edit-sub-password').value;
  const status = document.getElementById('edit-sub-status').value;
  const expires = document.getElementById('edit-sub-expires').value;

  try {
    const res = await fetch(`/api/subscriptions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spotify_email: email,
        spotify_password: password || undefined,
        status: status,
        expires_at: expires ? new Date(expires).toISOString() : null
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-edit-sub');
    alert('Abonnement erfolgreich aktualisiert!');
    fetchStats();
  } catch (err) {
    alert(`Fehler: ${err.message}`);
  }
}

async function deleteSubscription() {
  const id = document.getElementById('edit-sub-id').value;
  if (!id) return;
  if (!confirm('Möchtest du dieses Abonnement wirklich löschen? Alle verknüpften Rechnungen werden ebenfalls gelöscht.')) return;

  try {
    const res = await fetch(`/api/subscriptions/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-edit-sub');
    alert('Abonnement erfolgreich gelöscht!');
    fetchStats();
  } catch (err) {
    alert(`Fehler beim Löschen: ${err.message}`);
  }
}

// ----------------- PACKAGES SECTION -----------------

async function fetchPackages() {
  try {
    const res = await fetch('/api/packages');
    const data = await res.json();
    
    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    const body = document.getElementById('table-packages-body');
    body.innerHTML = '';

    if (data.length === 0) {
      body.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Keine Pakete konfiguriert.</td></tr>`;
      return;
    }

    data.forEach(pkg => {
      body.innerHTML += `
        <tr>
          <td>*${pkg.name}*</td>
          <td>${pkg.duration_months} Monate</td>
          <td>${pkg.price_eur.toFixed(2)} EUR</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="editPackage('${pkg.id}', '${pkg.name}', ${pkg.duration_months}, ${pkg.price_eur})">Bearbeiten</button>
            <button class="btn btn-danger btn-sm" onclick="deletePackage('${pkg.id}')">Löschen</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

function showAddPackageModal() {
  document.getElementById('package-id').value = '';
  document.getElementById('package-name').value = '';
  document.getElementById('package-duration').value = '';
  document.getElementById('package-price').value = '';
  document.getElementById('package-modal-title').innerText = 'Add Package';
  openModal('modal-package');
}

function editPackage(id, name, duration, price) {
  document.getElementById('package-id').value = id;
  document.getElementById('package-name').value = name;
  document.getElementById('package-duration').value = duration;
  document.getElementById('package-price').value = price;
  document.getElementById('package-modal-title').innerText = 'Edit Package';
  openModal('modal-package');
}

async function submitPackageForm(e) {
  e.preventDefault();
  const id = document.getElementById('package-id').value;
  const name = document.getElementById('package-name').value;
  const duration = document.getElementById('package-duration').value;
  const price = document.getElementById('package-price').value;

  const url = id ? `/api/packages/${id}` : '/api/packages';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, duration_months: duration, price_eur: price })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-package');
    fetchPackages();
  } catch (err) {
    alert(`Failed saving package: ${err.message}`);
  }
}

async function deletePackage(id) {
  if (!confirm('Möchtest du dieses Paket wirklich löschen?')) return;
  try {
    const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchPackages();
  } catch (err) {
    alert(`Failed deleting package: ${err.message}`);
  }
}

// ----------------- KEYS SECTION -----------------

async function fetchKeys() {
  try {
    const res = await fetch('/api/keys');
    const data = await res.json();
    
    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    const body = document.getElementById('table-keys-body');
    body.innerHTML = '';

    const counts = { usable: 0, active: 0, expired: 0, error: 0 };

    if (data.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Keine Upgrade-Keys im Pool.</td></tr>`;
    } else {
      data.forEach(key => {
        if (counts[key.status] !== undefined) counts[key.status]++;
        
        const date = new Date(key.created_at).toLocaleDateString('de-DE');

        body.innerHTML += `
          <tr>
            <td>\`${key.api_key}\`</td>
            <td><span class="status-badge ${key.status}">${key.status}</span></td>
            <td>${key.spotify_account_id || '-'}</td>
            <td><span style="color:var(--error-color)">${key.error_message || ''}</span></td>
            <td>${date}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="checkKeyStatus('${key.id}')">🔄 Verify</button>
              <button class="btn btn-danger btn-sm" onclick="deleteKey('${key.id}')">Delete</button>
            </td>
          </tr>
        `;
      });
    }

    // Update summary bubbles
    document.getElementById('keys-count-usable').innerText = counts.usable;
    document.getElementById('keys-count-active').innerText = counts.active;
    document.getElementById('keys-count-expired').innerText = counts.expired;
    document.getElementById('keys-count-error').innerText = counts.error;
  } catch (err) {
    console.error(err);
  }
}

function showImportKeysModal() {
  document.getElementById('raw-keys').value = '';
  openModal('modal-import-keys');
}

async function submitImportKeysForm(e) {
  e.preventDefault();
  const rawKeys = document.getElementById('raw-keys').value;
  try {
    const res = await fetch('/api/keys/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawKeys })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-import-keys');
    alert(`${data.count} Keys erfolgreich importiert!`);
    fetchKeys();
  } catch (err) {
    alert(`Failed to import keys: ${err.message}`);
  }
}

async function checkKeyStatus(id) {
  try {
    const res = await fetch(`/api/keys/check/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    alert(`Key verifiziert. Neuer Status: ${data.status}`);
    fetchKeys();
  } catch (err) {
    alert(`Failed key check: ${err.message}`);
  }
}

async function deleteKey(id) {
  if (!confirm('Key aus der Datenbank löschen?')) return;
  try {
    const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchKeys();
  } catch (err) {
    alert(`Failed delete key: ${err.message}`);
  }
}

// ----------------- INTEGRATED LOCAL WALLET SECTION -----------------

async function fetchAddresses() {
  // Sync view states
  try {
    const res = await fetch('/api/wallet/status');
    const status = await res.json();

    if (checkRequestError(status)) return;

    const setupContainer = document.getElementById('wallet-setup-container');
    const unlockedContainer = document.getElementById('wallet-unlocked-container');
    const uncreatedDiv = document.getElementById('wallet-state-uncreated');
    const lockedDiv = document.getElementById('wallet-state-locked');

    if (!status.exists) {
      setupContainer.classList.remove('hidden');
      unlockedContainer.classList.add('hidden');
      uncreatedDiv.classList.remove('hidden');
      lockedDiv.classList.add('hidden');
      return; // Stop here
    }

    if (status.exists && !status.unlocked) {
      setupContainer.classList.remove('hidden');
      unlockedContainer.classList.add('hidden');
      uncreatedDiv.classList.add('hidden');
      lockedDiv.classList.remove('hidden');
      document.getElementById('unlock-password').value = '';
      return; // Stop here
    }

    // Unlocked state! Show manager
    setupContainer.classList.add('hidden');
    unlockedContainer.classList.remove('hidden');

    document.getElementById('wallet-xpub-display').innerText = status.xpub;
    document.getElementById('wallet-mnemonic-display').innerText = status.mnemonic || 'Mnemonic not in memory';

    // Query addresses list
    const addrRes = await fetch('/api/addresses');
    const addrs = await addrRes.json();

    if (checkRequestError(addrs)) return;

    const body = document.getElementById('table-addresses-body');
    body.innerHTML = '';

    if (addrs.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Keine Adressen vorhanden. Bitte Balances aktualisieren!</td></tr>`;
      return;
    }

    addrs.forEach(addr => {
      let statusHtml = '<span style="color:var(--accent-color)">Frei (usable)</span>';
      if (addr.is_reserved) {
        const expTime = new Date(addr.reserved_until).toLocaleTimeString('de-DE');
        statusHtml = `<span style="color:var(--warning-color)">Reserviert (bis ${expTime})</span>`;
      }

      body.innerHTML += `
        <tr id="addr-row-${addr.id}">
          <td>${addr.address_index}</td>
          <td>\`${addr.ltc_address}\`</td>
          <td>${statusHtml}</td>
          <td>${addr.use_count}</td>
          <td class="balance-cell">-</td>
          <td>
            ${addr.is_reserved ? `<button class="btn btn-secondary btn-sm" onclick="releaseAddress('${addr.id}')">Freigeben</button>` : '-'}
          </td>
        </tr>
      `;
    });

  } catch (err) {
    console.error('Wallet fetch failed:', err.message);
  }
}

let generatedMnemonic = '';

// Show wizards
async function showWalletWizard(type) {
  const createDiv = document.getElementById('wizard-create');
  const restoreDiv = document.getElementById('wizard-restore');

  if (type === 'create') {
    createDiv.classList.remove('hidden');
    restoreDiv.classList.add('hidden');
    document.getElementById('new-mnemonic-display').innerText = 'Generiere sichere Seed-Phrase...';
    try {
      const res = await fetch('/api/wallet/mnemonic');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      generatedMnemonic = data.mnemonic;
      document.getElementById('new-mnemonic-display').innerHTML = `<strong>${generatedMnemonic}</strong>`;
    } catch (err) {
      document.getElementById('new-mnemonic-display').innerText = 'Fehler beim Generieren der Seed-Phrase. Bitte lade die Seite neu.';
      alert(`Fehler beim Generieren des Seeds: ${err.message}`);
    }
  } else {
    createDiv.classList.add('hidden');
    restoreDiv.classList.remove('hidden');
  }
}

// Submit create wallet
async function submitCreateWallet() {
  const password = document.getElementById('create-wallet-password').value;
  if (!password) return alert('Bitte lege ein Passwort fest.');
  if (!generatedMnemonic) return alert('Mnemonic wurde noch nicht geladen. Bitte lade die Seite neu.');

  try {
    const res = await fetch('/api/wallet/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mnemonicPhrase: generatedMnemonic, password })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    alert('Wallet erfolgreich erstellt und verschlüsselt!');
    
    // Refresh view
    fetchAddresses();
  } catch (err) {
    alert(`Failed to create wallet: ${err.message}`);
  }
}

// Submit restore wallet
async function submitRestoreWallet() {
  const mnemonic = document.getElementById('restore-mnemonic').value.trim();
  const password = document.getElementById('restore-wallet-password').value;

  if (!mnemonic || !password) return alert('Seed-Phrase und Passwort werden benötigt!');

  try {
    const res = await fetch('/api/wallet/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mnemonicPhrase: mnemonic, password })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    alert('Wallet erfolgreich wiederhergestellt!');
    fetchAddresses();
  } catch (err) {
    alert(`Failed to restore wallet: ${err.message}`);
  }
}

// Unlock wallet
async function submitUnlockWallet(e) {
  e.preventDefault();
  const password = document.getElementById('unlock-password').value;

  try {
    const res = await fetch('/api/wallet/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    alert('Wallet erfolgreich entsperrt!');
    fetchAddresses();
  } catch (err) {
    alert(`Unlock failed: ${err.message}`);
  }
}

// Lock wallet
async function lockWallet() {
  try {
    await fetch('/api/wallet/lock', { method: 'POST' });
    alert('Wallet gesperrt.');
    fetchAddresses();
  } catch (err) {
    console.error(err);
  }
}

// Reveal/Hide Mnemonic toggle
function toggleMnemonicReveal() {
  const display = document.getElementById('wallet-mnemonic-display');
  if (display.classList.contains('hidden')) {
    display.classList.remove('hidden');
  } else {
    display.classList.add('hidden');
  }
}

// Withdraw Form submit
async function submitWithdrawForm(e) {
  e.preventDefault();
  const recipient = document.getElementById('withdraw-recipient').value.trim();
  const amount = document.getElementById('withdraw-amount').value;
  const fee = document.getElementById('withdraw-fee').value;

  if (!confirm(`Sende ${amount} LTC an ${recipient}?`)) return;

  try {
    const res = await fetch('/api/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipientAddress: recipient,
        amountLtc: amount,
        feeLtc: fee
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-withdraw');
    alert(`Transaktion erfolgreich gesendet!\nHash: ${data.txHash}`);
    refreshLtcBalances();
  } catch (err) {
    alert(`Transfer fehlgeschlagen: ${err.message}`);
  }
}

async function releaseAddress(id) {
  if (!confirm('Reservierung dieser Adresse vorzeitig aufheben?')) return;
  try {
    const res = await fetch(`/api/addresses/release/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchAddresses();
  } catch (err) {
    alert(`Failed to release address: ${err.message}`);
  }
}

async function refreshLtcBalances() {
  const cells = document.querySelectorAll('.balance-cell');
  cells.forEach(c => c.innerText = '⏳ Checking...');
  
  try {
    const res = await fetch('/api/addresses/balances');
    const data = await res.json();
    
    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    // Refresh address list in DOM to display any newly synchronized addresses
    await fetchAddresses();

    let total = 0;
    data.forEach(item => {
      const row = document.getElementById(`addr-row-${item.id}`);
      if (row) {
        row.querySelector('.balance-cell').innerText = `${item.balanceLtc.toFixed(4)} LTC`;
      }
      total += item.balanceLtc;
    });

    // Update total display in wallet view
    const totalEl = document.getElementById('wallet-total-balance');
    if (totalEl) {
      totalEl.innerText = `${total.toFixed(4)} LTC`;
    }
  } catch (err) {
    alert(`Failed checking balances: ${err.message}`);
    fetchAddresses();
  }
}

// ----------------- BROADCAST SECTION -----------------

async function fetchBroadcasts() {
  try {
    const res = await fetch('/api/broadcasts');
    const data = await res.json();

    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    const body = document.getElementById('table-broadcasts-body');
    body.innerHTML = '';

    if (data.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No broadcasts sent or scheduled.</td></tr>`;
      return;
    }

    data.forEach(bc => {
      const created = new Date(bc.created_at).toLocaleString('de-DE');
      const scheduled = bc.scheduled_at ? new Date(bc.scheduled_at).toLocaleString('de-DE') : 'Sofort / Immediate';
      const truncatedMessage = bc.message.length > 50 ? bc.message.substring(0, 50) + '...' : bc.message;
      
      body.innerHTML += `
        <tr>
          <td>${created}</td>
          <td title="${bc.message.replace(/"/g, '&quot;')}">${truncatedMessage}</td>
          <td>${scheduled}</td>
          <td><span class="status-badge ${bc.status}">${bc.status}</span></td>
          <td>${bc.sent_count}</td>
          <td>
            ${bc.status === 'pending' ? `<button class="btn btn-danger btn-sm" onclick="deleteBroadcast('${bc.id}')">Delete</button>` : '-'}
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

function showAddBroadcastModal() {
  document.getElementById('broadcast-message').value = '';
  document.getElementById('broadcast-scheduled').value = '';
  openModal('modal-broadcast');
}

async function submitBroadcastForm(e) {
  e.preventDefault();
  const message = document.getElementById('broadcast-message').value;
  const scheduledAt = document.getElementById('broadcast-scheduled').value;

  try {
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        scheduled_at: scheduledAt || undefined
      })
    });
    
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-broadcast');
    
    if (data.sent_count !== undefined) {
      alert(`Broadcast successfully sent!\n\nSuccessful: ${data.sent_count}\nFailed: ${data.failed_count}`);
    } else {
      alert('Broadcast successfully scheduled!');
    }
    
    fetchBroadcasts();
  } catch (err) {
    alert(`Failed to save broadcast: ${err.message}`);
  }
}

async function deleteBroadcast(id) {
  if (!confirm('Cancel and delete this pending broadcast?')) return;
  try {
    const res = await fetch(`/api/broadcasts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchBroadcasts();
  } catch (err) {
    alert(`Failed to delete broadcast: ${err.message}`);
  }
}

// ----------------- SYSTEM LOGS SECTION -----------------

async function fetchLogs() {
  try {
    const { data: allLogs, error } = await supabaseClientQueryLogs();
    
    if (error) {
      checkRequestError({ error: error.message || error });
      return;
    }
    if (checkRequestError(allLogs)) return;

    const body = document.getElementById('table-logs-body');
    body.innerHTML = '';

    if (!allLogs || allLogs.length === 0) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Keine Fehlermeldungen vorhanden.</td></tr>`;
      return;
    }

    allLogs.forEach(log => {
      const time = new Date(log.created_at).toLocaleString('de-DE');
      const details = log.details ? JSON.stringify(log.details) : '';
      body.innerHTML += `
        <tr>
          <td>${time}</td>
          <td><span style="color:${log.level === 'ERROR' ? 'var(--error-color)' : 'var(--accent-color)'}">${log.level}</span></td>
          <td>${log.component}</td>
          <td>${log.message}</td>
          <td><code>${details}</code></td>
          <td>${log.is_resolved ? '✅ Gelöst' : '🚨 Offen'}</td>
          <td>
            ${!log.is_resolved ? `<button class="btn btn-secondary btn-sm" onclick="resolveLog('${log.id}')">Resolve</button>` : '-'}
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function supabaseClientQueryLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (data.error) return { data: null, error: new Error(data.error) };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ----------------- COUPONS SECTION -----------------

async function fetchCoupons() {
  try {
    const res = await fetch('/api/coupons');
    const data = await res.json();
    
    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    const body = document.getElementById('table-coupons-body');
    body.innerHTML = '';

    if (data.length === 0) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Keine Coupons vorhanden.</td></tr>`;
      return;
    }

    data.forEach(coupon => {
      const created = new Date(coupon.created_at).toLocaleString('de-DE');
      const expires = coupon.expires_at ? new Date(coupon.expires_at).toLocaleString('de-DE') : 'Never';
      const maxUses = coupon.max_uses !== null ? coupon.max_uses : '∞';
      const discountSymbol = coupon.discount_type === 'percentage' ? '%' : '€';
      
      body.innerHTML += `
        <tr>
          <td><strong><code>${coupon.code}</code></strong></td>
          <td>${coupon.discount_type}</td>
          <td>${parseFloat(coupon.discount_value).toFixed(2)}${discountSymbol}</td>
          <td>${maxUses}</td>
          <td>${coupon.use_count}</td>
          <td>${expires}</td>
          <td>${created}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteCoupon('${coupon.id}')">Löschen</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

function showAddCouponModal() {
  document.getElementById('coupon-code').value = '';
  document.getElementById('coupon-type').value = 'percentage';
  document.getElementById('coupon-value').value = '';
  document.getElementById('coupon-max-uses').value = '';
  document.getElementById('coupon-expires').value = '';
  openModal('modal-coupon');
}

async function submitCouponForm(e) {
  e.preventDefault();
  const code = document.getElementById('coupon-code').value.trim();
  const type = document.getElementById('coupon-type').value;
  const value = document.getElementById('coupon-value').value;
  const maxUses = document.getElementById('coupon-max-uses').value;
  const expires = document.getElementById('coupon-expires').value;

  try {
    const res = await fetch('/api/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        discount_type: type,
        discount_value: value,
        max_uses: maxUses || null,
        expires_at: expires || null
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    closeModal('modal-coupon');
    fetchCoupons();
  } catch (err) {
    alert(`Failed saving coupon: ${err.message}`);
  }
}

async function deleteCoupon(id) {
  if (!confirm('Möchtest du diesen Coupon wirklich löschen?')) return;
  try {
    const res = await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchCoupons();
  } catch (err) {
    alert(`Fehler beim Löschen des Coupons: ${err.message}`);
  }
}

// ----------------- FEEDBACK/RATINGS SECTION -----------------

async function fetchFeedback() {
  try {
    const res = await fetch('/api/feedback');
    const data = await res.json();
    
    if (checkRequestError(data)) return;
    if (data.error) throw new Error(data.error);

    const body = document.getElementById('table-feedback-body');
    body.innerHTML = '';

    if (data.length === 0) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Keine Bewertungen vorhanden.</td></tr>`;
      return;
    }

    data.forEach(fb => {
      const created = new Date(fb.created_at).toLocaleString('de-DE');
      const telegramId = fb.users ? fb.users.telegram_id : '-';
      const username = fb.users && fb.users.username ? `@${fb.users.username}` : '-';
      const packageName = fb.subscriptions && fb.subscriptions.packages ? fb.subscriptions.packages.name : '-';
      const stars = '⭐'.repeat(fb.rating);
      const comment = fb.comment ? fb.comment : '-';
      
      body.innerHTML += `
        <tr>
          <td>${created}</td>
          <td><code>${telegramId}</code></td>
          <td>${username}</td>
          <td>${packageName}</td>
          <td>${stars} (${fb.rating}/5)</td>
          <td>${comment}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteFeedback('${fb.id}')">Löschen</button>
          </td>
        </tr>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

async function deleteFeedback(id) {
  if (!confirm('Möchtest du diese Bewertung wirklich löschen?')) return;
  try {
    const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    fetchFeedback();
  } catch (err) {
    alert(`Fehler beim Löschen der Bewertung: ${err.message}`);
  }
}
