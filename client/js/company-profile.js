import { companyApi } from './api/companyApi.js';
import { renderLayout }   from './layout.js';
import { showToast }      from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Şirket Profili' });
if (!user) throw new Error('redirect');

if (user.role !== 'company') {
    const pb = document.querySelector('.page-body');
    if (pb) pb.innerHTML = `
        <div class="content-card glass-card" style="text-align:center;padding:48px 24px;max-width:480px;margin:48px auto;">
            <div style="font-size:48px;margin-bottom:16px;">🔒</div>
            <h2 style="font-size:20px;font-weight:700;margin-bottom:10px;">Erişim Kısıtlı</h2>
            <p style="color:var(--color-text-muted);font-size:14px;margin:0 0 24px;">
                Bu özellik yalnızca şirket hesapları için kullanılabilir.
            </p>
            <a href="dashboard.html" class="btn-primary">Özet Panele Dön</a>
        </div>`;
    throw new Error('non-company-role');
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cpCompanyName      = document.getElementById('cpCompanyName');
const cpCbamSector       = document.getElementById('cpCbamSector');
const cpExportsToEu      = document.getElementById('cpExportsToEu');
const cpCountry          = document.getElementById('cpCountry');
const cpAnnualProduction = document.getElementById('cpAnnualProduction');
const cpCarbonPrice      = document.getElementById('cpCarbonPrice');
const cpSaveBtn          = document.getElementById('cpSaveBtn');

// ── Populate form with existing profile data ──────────────────────────────────
async function loadProfile() {
  try {
    const res     = await companyApi.getProfile();
    const profile = res.data?.profile;
    if (!profile) return; // first time — form stays empty

    if (cpCompanyName      && profile.company_name)          cpCompanyName.value      = profile.company_name;
    if (cpCbamSector       && profile.cbam_sector)           cpCbamSector.value       = profile.cbam_sector;
    if (cpExportsToEu)                                        cpExportsToEu.value      = profile.exports_to_eu ? 'true' : 'false';
    if (cpCountry          && profile.country)               cpCountry.value          = profile.country;
    if (cpAnnualProduction && profile.annual_production)     cpAnnualProduction.value = profile.annual_production;
    if (cpCarbonPrice      && profile.default_carbon_price)  cpCarbonPrice.value      = profile.default_carbon_price;
  } catch (err) {
    showToast('Hata', err.message, 'error');
  }
}

// ── Save profile ──────────────────────────────────────────────────────────────
cpSaveBtn?.addEventListener('click', async () => {
  const companyName = cpCompanyName?.value.trim();
  if (!companyName) {
    showToast('Hata', 'Şirket adı zorunludur.', 'error');
    cpCompanyName?.focus();
    return;
  }

  const cbamSector = cpCbamSector?.value;
  if (!cbamSector) {
    showToast('Hata', 'CBAM sektörü seçilmelidir.', 'error');
    cpCbamSector?.focus();
    return;
  }

  const annualProd = cpAnnualProduction?.value;
  if (annualProd && (isNaN(parseFloat(annualProd)) || parseFloat(annualProd) <= 0)) {
    showToast('Hata', 'Yıllık üretim miktarı pozitif bir sayı olmalıdır.', 'error');
    cpAnnualProduction?.focus();
    return;
  }

  const carbonPrice = cpCarbonPrice?.value;
  if (carbonPrice && (isNaN(parseFloat(carbonPrice)) || parseFloat(carbonPrice) < 0)) {
    showToast('Hata', 'Karbon fiyatı sıfır veya pozitif bir sayı olmalıdır.', 'error');
    cpCarbonPrice?.focus();
    return;
  }

  cpSaveBtn.disabled    = true;
  cpSaveBtn.textContent = 'Kaydediliyor…';

  try {
    await companyApi.upsertProfile({
      company_name:         companyName,
      cbam_sector:          cbamSector,
      exports_to_eu:        cpExportsToEu?.value === 'true',
      country:              cpCountry?.value.trim()      || undefined,
      annual_production:    annualProd                   || undefined,
      default_carbon_price: carbonPrice                  || undefined,
    });
    showToast('Başarılı', 'Şirket profili kaydedildi.', 'success');
    setTimeout(() => { window.location.href = 'company.html'; }, 900);
  } catch (err) {
    showToast('Hata', err.message, 'error');
  } finally {
    cpSaveBtn.disabled    = false;
    cpSaveBtn.textContent = 'Profili Kaydet';
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadProfile();
