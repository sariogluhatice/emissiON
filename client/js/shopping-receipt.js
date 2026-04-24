import { emissionService } from './api/emissionService.js';
import { TokenManager } from './api/tokenManager.js';
import { getCurrentUser, renderTopbarUser, bindLogout, showToast } from './utils/uiUtils.js';

const user = getCurrentUser();
if (!user) window.location.href = 'login.html';
renderTopbarUser(user);
bindLogout();

const receiptFileEl  = document.getElementById('receiptFile');
const scanBtn        = document.getElementById('scanBtn');
const scanProgress   = document.getElementById('scanProgress');
const extractedBox   = document.getElementById('extractedBox');
const extAmount      = document.getElementById('extAmount');
const extCurrency    = document.getElementById('extCurrency');
const extDate        = document.getElementById('extDate');
const extRate        = document.getElementById('extRate');
const extUsd         = document.getElementById('extUsd');

const saveForm       = document.getElementById('saveForm');
const descInput      = document.getElementById('descInput');
const co2Input       = document.getElementById('co2Input');
const dateInput      = document.getElementById('dateInput');
const resultBox      = document.getElementById('resultBox');
const saveBtn        = document.getElementById('saveBtn');

// Date bounds
const today = new Date().toISOString().split('T')[0];
const minDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
dateInput.setAttribute('max', today);
dateInput.setAttribute('min', minDate);

scanBtn.addEventListener('click', async () => {
    const file = receiptFileEl.files?.[0];
    if (!file) {
        showToast('No file', 'Please select a PDF or image first.', 'error');
        return;
    }

    scanBtn.disabled = true;
    scanProgress.textContent = 'Uploading and scanning…';
    extractedBox.style.display = 'none';
    resultBox.textContent = 'Scan a receipt to see the CO₂ breakdown here.';

    try {
        const formData = new FormData();
        formData.append('receipt', file);

        const res = await fetch('/api/ocr/shopping', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${TokenManager.get() || ''}` },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Scan failed.');

        // Show extracted data
        extractedBox.style.display = 'block';
        extAmount.textContent   = `${data.originalAmount} ${data.currency}`;
        extCurrency.textContent = data.currency;
        extDate.textContent     = data.date || 'Not found';
        extRate.textContent     = data.exchangeRate
            ? `1 ${data.currency} = ${data.exchangeRate} USD`
            : '—';
        extUsd.textContent      = `$${data.usdAmount}`;

        // Pre-fill save form
        co2Input.value  = parseFloat(data.co2e).toFixed(4);
        if (data.date) {
            dateInput.value = data.date.length === 7 ? `${data.date}-01` : data.date;
        }

        // Result summary box
        resultBox.innerHTML = `
            <strong style="display:block;margin-bottom:4px;">CO₂ Breakdown</strong>
            ${data.originalAmount} ${data.currency}
            → $${data.usdAmount} USD
            (rate: ${data.exchangeRate ?? '—'})<br>
            <span style="font-size:15px;font-weight:700;color:var(--color-primary);">
              ${parseFloat(data.co2e).toFixed(3)} kg CO₂e
            </span>
        `;

        scanProgress.textContent = 'Scan complete — review and save below.';
        showToast('Scan complete', `${data.originalAmount} ${data.currency} → ${parseFloat(data.co2e).toFixed(3)} kg CO₂e`, 'success');
    } catch (err) {
        scanProgress.textContent = `Error: ${err.message}`;
        showToast('Scan failed', err.message, 'error');
    } finally {
        scanBtn.disabled = false;
    }
});

saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    document.getElementById('co2Error').textContent  = '';
    document.getElementById('dateError').textContent = '';

    const co2  = parseFloat(co2Input.value);
    const date = dateInput.value;
    const desc = descInput.value.trim() || 'Shopping Receipt';

    let valid = true;
    if (!co2 || co2 <= 0) {
        document.getElementById('co2Error').textContent = 'Please scan a receipt first or enter a value.';
        valid = false;
    }
    if (!date) {
        document.getElementById('dateError').textContent = 'Please select a date.';
        valid = false;
    }
    if (!valid) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
        await emissionService.create({
            source: desc,
            amount: co2,
            date
        });
        showToast('Saved!', 'Emission entry created successfully.', 'success');
        setTimeout(() => { window.location.href = 'emissions.html'; }, 1200);
    } catch (err) {
        showToast('Save failed', err.message || 'Could not save entry.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Emission Entry';
    }
});
