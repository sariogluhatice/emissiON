import { companyService } from './api/companyService.js';
import { renderLayout }   from './layout.js';
import { showToast }      from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Yeni Şirket Görevi' });
if (!user) throw new Error('redirect');

if (user.role !== 'company') {
    window.location.href = 'company-tasks.html';
    throw new Error('non-company-role');
}

const ctTitleEl     = document.getElementById('ctTitle');
const ctDescEl      = document.getElementById('ctDesc');
const ctDueDateEl   = document.getElementById('ctDueDate');
const ctEmCatEl     = document.getElementById('ctEmCat');
const ctTargetPctEl = document.getElementById('ctTargetPct');
const ctCreateBtn   = document.getElementById('ctCreateBtn');

if (ctDueDateEl) ctDueDateEl.min = new Date().toISOString().split('T')[0];

ctCreateBtn?.addEventListener('click', async () => {
    const title = ctTitleEl?.value.trim();
    if (!title) {
        showToast('Hata', 'Görev başlığı gereklidir.', 'error');
        ctTitleEl?.focus();
        return;
    }

    if (!ctDueDateEl?.value) {
        showToast('Hata', 'Son tarih zorunludur.', 'error');
        ctDueDateEl?.focus();
        return;
    }

    const emCat     = ctEmCatEl?.value    || '';
    const targetPct = ctTargetPctEl?.value || '';

    if ((emCat && !targetPct) || (!emCat && targetPct)) {
        showToast('Hata', 'Emisyon kategorisi ve azaltım hedefi birlikte girilmelidir.', 'error');
        (emCat ? ctTargetPctEl : ctEmCatEl)?.focus();
        return;
    }
    if (targetPct) {
        const pct = parseFloat(targetPct);
        if (isNaN(pct) || pct < 1 || pct > 99) {
            showToast('Hata', 'Azaltım hedefi 1 ile 99 arasında olmalıdır.', 'error');
            ctTargetPctEl?.focus();
            return;
        }
    }

    ctCreateBtn.disabled    = true;
    ctCreateBtn.textContent = 'Oluşturuluyor…';

    try {
        await companyService.createTask({
            title,
            description:          ctDescEl?.value.trim()  || undefined,
            due_date:             ctDueDateEl?.value       || undefined,
            emission_category:    emCat                   || undefined,
            target_reduction_pct: targetPct               || undefined,
        });
        showToast('Başarılı', 'Görev oluşturuldu.', 'success');
        window.location.href = 'company-tasks.html';
    } catch (err) {
        showToast('Hata', err.message, 'error');
        ctCreateBtn.disabled    = false;
        ctCreateBtn.textContent = 'Görev Oluştur';
    }
});
