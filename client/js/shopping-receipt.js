import { emissionApi } from './api/emissionApi.js';
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
        showToast('Dosya Seçilmedi', 'Lütfen önce bir PDF veya görsel seçin.', 'error');
        return;
    }

    scanBtn.disabled = true;
    scanProgress.textContent = 'Yükleniyor ve taranıyor…';
    extractedBox.style.display = 'none';
    resultBox.textContent = 'CO₂ dağılımını görmek için bir fiş tarayın.';

    try {
        const formData = new FormData();
        formData.append('receipt', file);

        const res = await fetch('/api/ocr/shopping', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${TokenManager.get() || ''}` },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Tarama başarısız.');

        // DEBUG — remove when done
        console.log('[Shopping OCR raw response]', data);
        let dbg = document.getElementById('_shopDebug');
        if (!dbg) {
            dbg = document.createElement('pre');
            dbg.id = '_shopDebug';
            dbg.style.cssText = 'background:#111;color:#0f0;font-size:11px;padding:10px;border-radius:6px;white-space:pre-wrap;margin-top:12px;max-height:200px;overflow:auto;';
            extractedBox.after(dbg);
        }
        dbg.textContent = JSON.stringify(data, null, 2);

        // Show extracted data
        extractedBox.style.display = 'block';
        extAmount.textContent   = `${data.originalAmount} ${data.currency}`;
        extCurrency.textContent = data.currency;
        extDate.textContent     = data.date || 'Bulunamadı';
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
            <strong style="display:block;margin-bottom:4px;">CO₂ Dağılımı</strong>
            ${data.originalAmount} ${data.currency}
            → $${data.usdAmount} USD
            (kur: ${data.exchangeRate ?? '—'})<br>
            <span style="font-size:15px;font-weight:700;color:var(--color-primary);">
              ${parseFloat(data.co2e).toFixed(3)} kg CO₂e
            </span>
        `;

        scanProgress.textContent = 'Tarama tamamlandı — aşağıdan inceleyin ve kaydedin.';
        showToast('Tarama Tamamlandı', `${data.originalAmount} ${data.currency} → ${parseFloat(data.co2e).toFixed(3)} kg CO₂e`, 'success');
    } catch (err) {
        scanProgress.textContent = `Hata: ${err.message}`;
        showToast('Tarama Başarısız', err.message, 'error');
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
    const desc = descInput.value.trim() || 'Alışveriş Fişi';

    let valid = true;
    if (!co2 || co2 <= 0) {
        document.getElementById('co2Error').textContent = 'Önce bir fiş tarayın veya değer girin.';
        valid = false;
    }
    if (!date) {
        document.getElementById('dateError').textContent = 'Lütfen bir tarih seçin.';
        valid = false;
    }
    if (!valid) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Kaydediliyor…';

    try {
        await emissionApi.create({
            source: desc,
            amount: co2,
            date
        });
        showToast('Kaydedildi!', 'Emisyon kaydı başarıyla oluşturuldu.', 'success');
        setTimeout(() => { window.location.href = 'emissions.html'; }, 1200);
    } catch (err) {
        showToast('Kayıt Başarısız', err.message || 'Kayıt yapılamadı.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Emisyon Kaydını Kaydet';
    }
});
