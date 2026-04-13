import { TokenManager }   from './api/tokenManager.js';
import { emissionService } from './api/emissionService.js';

// Guard: redirect to login if not authenticated
if (!TokenManager.exists()) {
  window.location.href = 'login.html';
}

const recordList   = document.getElementById('recordList');
const emptyState   = document.getElementById('emptyState');
const userGreeting = document.getElementById('userGreeting');
const logoutBtn    = document.getElementById('logoutBtn');

logoutBtn.addEventListener('click', () => {
  TokenManager.remove();
  window.location.href = 'login.html';
});

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function createCard(record) {
  const card = document.createElement('div');
  card.className  = 'record-card';
  card.dataset.id = record.id;

  card.innerHTML = `
    <div class="record-info">
      <span class="record-source">${record.source}</span>
      <span class="record-meta">${formatDate(record.date)}</span>
    </div>
    <span class="record-amount">${parseFloat(record.amount).toFixed(2)} kg CO₂</span>
    <div class="record-actions">
      <a href="record-form.html?id=${record.id}" class="link-btn">Edit</a>
      <button class="link-btn" style="color:var(--color-error)" data-delete="${record.id}">Delete</button>
    </div>
  `;

  return card;
}

async function loadRecords() {
  try {
    const { records } = await emissionService.getAll();

    recordList.innerHTML = '';

    if (records.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    records.forEach(r => recordList.appendChild(createCard(r)));
  } catch {
    emptyState.textContent  = 'Failed to load records.';
    emptyState.style.display = 'block';
  }
}

recordList.addEventListener('click', async (e) => {
  const id = e.target.dataset.delete;
  if (!id) return;

  if (!confirm('Delete this record?')) return;

  try {
    await emissionService.remove(id);
    document.querySelector(`[data-id="${id}"]`)?.remove();

    if (recordList.children.length === 0) {
      emptyState.style.display = 'block';
    }
  } catch {
    alert('Failed to delete record.');
  }
});

loadRecords();
