import { TokenManager }   from './api/tokenManager.js';
import { ApiClient }      from './api/apiClient.js';
import { getCurrentUser } from './utils/uiUtils.js';
// ThemeManager removed — dark-only UI by default

// ── Auth guard ──────────────────────────────────────────────────────────────
if (!TokenManager.exists()) window.location.replace('login.html');
const user = getCurrentUser();
const isRetake = new URLSearchParams(window.location.search).has('retake');
if (!user || (user.onboarding_completed === true && !isRetake)) window.location.replace('dashboard.html');

const role = user?.role ?? 'individual';
const api  = new ApiClient();

// ── Collected answers (persists across steps) ───────────────────────────────
const answers = {};

// ── Field helpers (keep step definitions concise) ───────────────────────────
const sel  = (key, label, options, required = true,  roles = 'all', showIf = null) =>
  ({ key, label, type: 'select',         options, required, roles, showIf });
const rad  = (key, label, options, required = true,  roles = 'all', showIf = null) =>
  ({ key, label, type: 'radio',          options, required, roles, showIf });
const chk  = (key, label, options, required = false, roles = 'all', showIf = null) =>
  ({ key, label, type: 'checkbox-group', options, required, roles, showIf });
const txt  = (key, label,          required = true,  roles = 'all') =>
  ({ key, label, type: 'text',           required, roles, showIf: null });

const IH = ['individual', 'household']; // shorthand

// ── Step definitions ─────────────────────────────────────────────────────────
// ── Adım Tanımları (Tam Türkçe) ───────────────────────────────────────────────
const ALL_STEPS = [
  {
    id: 'profile', title: 'Profilin',
    subtitle: 'Sizin için en doğru analizi yapabilmemiz adına durumunuzu anlayalım.',
    rightDesc: 'Kişisel profiliniz, platformdaki tüm hesaplamaların temel taşını oluşturur. Size özel bir karbon yol haritası için ilk adımı atıyorsunuz.',
    icon: '👤', roles: 'all',
    fields: [
      rad('home_type', 'Konut Tipi',
        [['apartment','Apartman Dairesi'],['house','Müstakil Ev'],['detached','Villa / Köşk'],
         ['shared','Paylaşımlı Ev'],['dormitory','Öğrenci Yurdu']],
        true, ['individual']),
      rad('household_size', 'Evde kaç kişi yaşıyorsunuz?',
        [['1','Sadece Ben'],['2','2'],['3','3'],['4','4'],['5','5'],['6+','6+']],
        true, ['individual']),
      rad('household_size', 'Hane halkı kaç kişiden oluşuyor?',
        [['2','2'],['3','3'],['4','4'],['5','5'],['6+','6+']],
        true, ['household']),
      rad('is_household_head', 'Hanenin birincil hesap sahibi misiniz?',
        [['true','Evet'],['false','Hayır']],
        true, ['household']),
      rad('home_type', 'Ev Tipi',
        [['apartment','Apartman Dairesi'],['house','Müstakil Ev'],['detached','Villa / Köşk'],['shared','Paylaşımlı / Kiralık Oda']],
        true, ['household']),
      txt('company_name', 'Şirket Adı', true, ['company']),
      sel('industry', 'Sektör',
        [['manufacturing','Üretim'],['technology','Teknoloji'],['retail','Perakende'],
         ['healthcare','Sağlık'],['finance','Finans'],['transportation','Ulaşım'],
         ['education','Eğitim'],['construction','İnşaat'],['energy','Enerji'],['other','Diğer']],
        true, ['company']),
      rad('employee_count_range', 'Çalışan Sayısı',
        [['1-10','1–10'],['11-50','11–50'],['51-200','51–200'],['201-1000','201–1000'],['1000+','1000+']],
        true, ['company']),
      rad('department_count_range', 'Departman Sayısı',
        [['1-3','1–3'],['4-10','4–10'],['11-25','11–25'],['25+','25+']],
        true, ['company']),
    ],
  },
  {
    id: 'energy', title: 'Ev & Enerji',
    subtitle: 'Ev enerjisi genellikle kişisel karbon ayak izinin en büyük dilimidir.',
    rightDesc: 'Evlerde kullanılan elektriğin yaklaşık %20\'si bekleme modundaki cihazlardan kaynaklanır. Küçük değişimler büyük etkiler yaratır.',
    icon: '⚡', roles: IH,
    fields: [
      sel('monthly_kwh', 'Tahmini aylık elektrik kullanımı',
        [['<100','100 kWh\'den az'],['100-200','100–200 kWh'],['200-400','200–400 kWh'],
         ['400-600','400–600 kWh'],['>600','600 kWh üzeri'],['unknown','Bilmiyorum']]),
      sel('heating_type', 'Birincil ısınma kaynağı',
        [['natural_gas','Doğalgaz'],['electricity','Elektrik'],['coal','Kömür / Katı Yakıt'],
         ['wood','Odun / Biyokütle'],['heat_pump','Isı Pompası'],['district','Merkezi Isıtma'],['none','Isınma yok']]),
      rad('has_ac', 'Klima kullanıyor musunuz?',
        [['true','Evet'],['false','Hayır']]),
      sel('renewable_energy', 'Evdeki yenilenebilir enerji',
        [['solar','Güneş Panelleri'],['green_plan','Yeşil Enerji Tarifesi'],['both','Her İkisi'],['none','Hiçbiri']]),
      rad('water_saving_devices', 'Su tasarrufu sağlayan cihazlar (tasarruflu musluk vb.) kullanıyor musunuz?',
        [['true','Evet'],['false','Hayır']], false),
    ],
  },
  {
    id: 'office_energy', title: 'Ofis & Enerji',
    subtitle: 'Şirketinizin enerji kullanımı hakkında bize bilgi verin.',
    rightDesc: 'Sürdürülebilir bir ofis sadece doğayı değil, şirket maliyetlerini de korur. Enerji kaynaklarınızı optimize ederek geleceği tasarlayın.',
    icon: '🏢', roles: ['company'],
    fields: [
      sel('office_energy_source', 'Birincil ofis enerji kaynağı',
        [['grid','Şebeke Elektriği'],['natural_gas','Doğalgaz + Elektrik'],
         ['renewable','Yenilenebilir / Yeşil Enerji'],['mixed','Karma Kaynaklar']]),
      rad('office_electricity_level', 'Tahmini ofis elektrik tüketimi',
        [['low','Düşük (küçük ofis, < 1.000 kWh/ay)'],['medium','Orta (1.000–5.000 kWh/ay)'],
         ['high','Yüksek (5.000–20.000 kWh/ay)'],['very_high','Çok Yüksek (20.000+ kWh/ay)']]),
      rad('remote_work_policy', 'Çalışma politikası',
        [['on_site','Tamamen Ofisten'],['hybrid','Hibrit'],['fully_remote','Tamamen Uzaktan']], false),
    ],
  },
  {
    id: 'transport', title: 'Ulaşım',
    subtitle: 'Günlük hayatta nasıl seyahat ediyorsunuz?',
    rightDesc: 'Günde sadece 10 km daha az araç sürmek, yılda yaklaşık 1 ton CO2 tasarrufu sağlar. Hareket tarzınız dünyayı değiştirir.',
    icon: '🚗', roles: 'all',
    fields: [
      rad('has_car', 'Düzenli olarak araç kullanıyor musunuz?',
        [['true','Evet'],['false','Hayır']],
        true, IH),
      rad('car_fuel_type', 'Araç yakıt tipi',
        [['petrol','Benzin'],['diesel','Dizel'],['lpg','LPG'],['hybrid','Hibrit'],['electric','Elektrikli']],
        true, IH, a => a.has_car === 'true'),
      rad('weekly_km', 'Haftalık ortalama sürüş mesafesi',
        [['<50','< 50 km'],['50-150','50–150 km'],['150-300','150–300 km'],
         ['300-500','300–500 km'],['>500','> 500 km']],
        false, IH, a => a.has_car === 'true'),
      rad('carpooling', 'Araç paylaşımı kullanıyor musunuz?',
        [['true','Evet'],['false','Hayır']],
        false, IH, a => a.has_car === 'true'),
      sel('public_transport_freq', 'Toplu taşıma kullanım sıklığı',
        [['daily','Günlük'],['few_week','Haftada birkaç kez'],['weekly','Haftalık'],['rarely','Nadiren'],['never','Hiçbir zaman']]),
      rad('public_transport_type', 'Ana toplu taşıma türü',
        [['bus','Otobüs'],['metro','Metro / Metrobüs'],['train','Tren / Raylı Sistem'],['ferry','Vapur'],['mixed','Karma']],
        false, 'all', a => a.public_transport_freq !== 'never' && !!a.public_transport_freq),
      rad('cycles_or_walks', 'Düzenli olarak yürüyor veya bisiklete biniyor musunuz?',
        [['true','Evet'],['false','Hayır']],
        true, IH),
      sel('taxi_freq', 'Taksi / Uber kullanım sıklığı',
        [['daily','Günlük'],['weekly','Haftalık'],['monthly','Aylık'],['rarely','Nadiren'],['never','Hiçbir zaman']],
        false, IH),
      rad('has_company_vehicles', 'Şirketinizin araç filosu var mı?',
        [['true','Evet'],['false','Hayır']],
        true, ['company']),
      rad('fleet_fuel', 'Filo yakıt tipi',
        [['petrol','Ağırlıklı Benzin'],['diesel','Ağırlıklı Dizel'],['electric','Elektrikli Filo'],['mixed','Karma']],
        false, ['company'], a => a.has_company_vehicles === 'true'),
      rad('fleet_size', 'Filo boyutu (araç sayısı)',
        [['1-5','1–5'],['6-20','6–20'],['21-50','21–50'],['50+','50+']],
        false, ['company'], a => a.has_company_vehicles === 'true'),
    ],
  },
  {
    id: 'flights', title: 'Uçuş & Seyahat',
    subtitle: 'Havacılık, kilometre başına en yoğun karbon salınımı yapan aktivitelerden biridir.',
    rightDesc: 'Tek bir kıtalararası uçuş, bir kişinin yıllık ortalama karbon bütçesinin yarısını tüketebilir. Uçuşlarınızı dengelemek bizim işimiz.',
    icon: '✈️', roles: 'all',
    fields: [
      rad('domestic_flights', 'Yıllık yurt içi uçuş sayısı',
        [['0','Hiç'],['1-2','1–2'],['3-5','3–5'],['6-10','6–10'],['10+','10+']]),
      rad('international_flights', 'Yıllık yurt dışı uçuş sayısı',
        [['0','Hiç'],['1-2','1–2'],['3-5','3–5'],['6-10','6–10'],['10+','10+']]),
      rad('typical_flight_distance', 'Tipik uçuş süresi',
        [['short','Kısa Mesafe (< 3 sa)'],['medium','Orta Mesafe (3–7 sa)'],['long','Uzun Mesafe (7 sa+)']],
        false, 'all', a => a.domestic_flights !== '0' || a.international_flights !== '0'),
      rad('has_business_travel', 'İş amaçlı hava yoluyla seyahat ediyor musunuz?',
        [['true','Evet'],['false','Hayır']],
        false, 'all', a => (a.domestic_flights !== '0' && !!a.domestic_flights) || (a.international_flights !== '0' && !!a.international_flights)),
    ],
  },
  {
    id: 'food', title: 'Gıda & Beslenme',
    subtitle: 'Beslenme, ortalama bir hane halkı karbon ayak izinin %10-30\'unu oluşturur.',
    rightDesc: 'Bitki bazlı bir beslenme düzeni, gıda kaynaklı emisyonlarınızı %70\'e kadar düşürebilir. Tabağınızdaki tercihler iklimi korur.',
    icon: '🍽', roles: IH,
    fields: [
      rad('diet_type', 'Beslenme tarzınızı nasıl tanımlarsınız?',
        [['vegan','Vegan'],['vegetarian','Vejetaryen'],['pescatarian','Pesketaryen (Balık tüketen)'],
         ['mixed','Karma / Her şeyi yiyen'],['meat_heavy','Et ağırlıklı']], true),
      sel('red_meat_freq', 'Ne sıklıkla kırmızı et tüketirsiniz?',
        [['daily','Günlük'],['few_week','Haftada birkaç kez'],['weekly','Haftalık'],
         ['monthly','Aylık'],['rarely','Nadiren / Hiç']],
        false, IH, a => !['vegan','vegetarian','pescatarian'].includes(a.diet_type) && !!a.diet_type),
      rad('dairy_level', 'Süt ve süt ürünü tüketimi',
        [['high','Yüksek'],['medium','Orta'],['low','Düşük'],['none','Hiç']],
        false, IH, a => a.diet_type !== 'vegan' && !!a.diet_type),
      rad('local_food_pref', 'Yerel veya mevsimsel ürünleri mi tercih edersiniz?',
        [['always','Her zaman'],['often','Sık sık'],['sometimes','Bazen'],['rarely','Nadiren']], false),
      rad('food_waste', 'Genellikle ne kadar gıda israf edersiniz?',
        [['a_lot','Çok fazla'],['some','Biraz'],['little','Çok az'],['minimal','Neredeyse hiç']], false),
    ],
  },
  {
    id: 'shopping', title: 'Alışveriş & Atık',
    subtitle: 'Tüketim ve geri dönüşüm alışkanlıklarınız ayak izinizi tamamlar.',
    rightDesc: 'Satın aldığınız her yeni ürünün bir \'karbon hikayesi\' vardır. İkinci el tercih etmek bu hikayeyi daha yeşil kılar.',
    icon: '🛍', roles: IH,
    fields: [
      rad('online_shopping_freq', 'Online alışveriş sıklığı',
        [['daily','Günlük'],['weekly','Haftalık'],['monthly','Aylık'],['rarely','Nadiren']]),
      rad('new_vs_secondhand', 'Yeni mi yoksa ikinci el mi tercih edersiniz?',
        [['always_new','Her zaman yeni'],['mostly_new','Çoğunlukla yeni'],
         ['mixed','Her ikisinin karışımı'],['mostly_used','Çoğunlukla ikinci el']]),
      rad('fast_fashion', 'Hızlı moda (fast-fashion) markalarından alışveriş yapar mısınız?',
        [['yes','Evet, düzenli olarak'],['sometimes','Bazen'],['no','Nadiren / Hiç']], false),
      chk('recycling_categories', 'Hangi malzemeleri geri dönüştürürsünüz?',
        [['paper','Kağıt'],['plastic','Plastik'],['glass','Cam'],
         ['metal','Metal'],['ewaste','E-atık'],['none','Şu an geri dönüşüm yapmıyorum']]),
      rad('composting', 'Kompost yapıyor musunuz?',
        [['true','Evet'],['false','Hayır']], false),
      rad('waste_bags_week', 'Haftalık çıkan çöp torbası sayısı',
        [['1','1 torba'],['2','2 torba'],['3','3 torba'],['4+','4 veya daha fazla']], false),
      rad('single_use_plastic', 'Tek kullanımlık plastik kullanım sıklığı',
        [['daily','Günlük'],['weekly','Haftalık'],['sometimes','Bazen'],['rarely','Nadiren'],['never','Hiçbir zaman']], false),
    ],
  },
  {
    id: 'goals', title: 'Hedeflerin',
    subtitle: 'Panelinizi ve önerilerimizi sizin için en önemli olan şeylere göre özelleştireceğiz.',
    rightDesc: 'Size en uygun tasarruf önerilerini sunmak için önceliklerinizi anlıyoruz. Birlikte daha yeşil bir gelecek inşa edeceğiz.',
    icon: '🎯', roles: 'all',
    fields: [
      rad('motivation', 'Emisyon takibi yapmaktaki ana motivasyonunuz nedir?',
        [['save_money','Para tasarrufu'],['reduce_carbon','Karbon ayak izimi azaltmak'],
         ['company_reporting','Şirket raporlaması / uyumluluk'],
         ['environmental','Çevresel farkındalık'],['academic','Akademik / Proje kullanımı']]),
      rad('priority_area', 'İlk olarak hangi alanı iyileştirmek istersiniz?',
        [['transport','Ulaşım'],['energy','Ev enerjisi'],['flights','Uçuş ve seyahat'],
         ['food','Gıda ve beslenme'],['shopping','Alışveriş'],['waste','Atık ve geri dönüşüm'],
         ['supply_chain','Tedarik zinciri']]),
    ],
  },
];

// ── Resolve step list for this user's role ───────────────────────────────────
function getVisibleSteps() {
  return ALL_STEPS.filter(s =>
    s.roles === 'all' || s.roles.includes(role)
  );
}

function getVisibleFields(step) {
  return step.fields.filter(f => {
    if (f.roles !== 'all' && !f.roles.includes(role)) return false;
    return true;
  });
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const stepContainer = document.getElementById('stepContainer');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const backBtn       = document.getElementById('backBtn');
const nextBtn       = document.getElementById('nextBtn');
const apiMessage    = document.getElementById('apiMessage');
const stepDots      = document.getElementById('stepDots');
const stepRightTitle= document.getElementById('stepRightTitle');
const stepRightDesc = document.getElementById('stepRightDesc');

// ── State ─────────────────────────────────────────────────────────────────────
const visibleSteps = getVisibleSteps();
let currentIndex   = 0;

// ── Field renderer ────────────────────────────────────────────────────────────
function buildFieldEl(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ob-field-wrapper';
  wrapper.id        = `fw-${field.key}`;

  const label = document.createElement('label');
  label.className   = 'label';
  label.textContent = field.label;
  wrapper.appendChild(label);

  if (field.type === 'text') {
    const input   = document.createElement('input');
    input.className = 'input';
    input.type      = 'text';
    input.id        = field.key;
    input.name      = field.key;
    if (answers[field.key]) input.value = answers[field.key];
    input.addEventListener('input', () => {
      answers[field.key] = input.value;
    });
    wrapper.appendChild(input);

  } else if (field.type === 'select') {
    const select   = document.createElement('select');
    select.className = 'input';
    select.id        = field.key;
    select.name      = field.key;

    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = 'Seçiniz…';
    select.appendChild(ph);

    field.options.forEach(([val, text]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = text;
      if (answers[field.key] === val) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', () => {
      answers[field.key] = select.value;
      refreshConditionals();
    });
    wrapper.appendChild(select);

  } else if (field.type === 'radio') {
    const group = document.createElement('div');
    group.className = 'radio-group';

    field.options.forEach(([val, text]) => {
      const uid   = `${field.key}-${val}`;
      const radio = document.createElement('input');
      radio.type  = 'radio';
      radio.id    = uid;
      radio.name  = field.key;
      radio.value = val;
      if (answers[field.key] === val) radio.checked = true;

      const lbl = document.createElement('label');
      lbl.htmlFor     = uid;
      lbl.textContent = text;

      radio.addEventListener('change', () => {
        answers[field.key] = val;
        refreshConditionals();
      });

      group.appendChild(radio);
      group.appendChild(lbl);
    });
    wrapper.appendChild(group);

  } else if (field.type === 'checkbox-group') {
    const group = document.createElement('div');
    group.className = 'checkbox-group';

    const saved = Array.isArray(answers[field.key]) ? answers[field.key] : [];

    field.options.forEach(([val, text]) => {
      const uid = `${field.key}-${val}`;
      const cb  = document.createElement('input');
      cb.type   = 'checkbox';
      cb.id     = uid;
      cb.name   = field.key;
      cb.value  = val;
      if (saved.includes(val)) cb.checked = true;

      const lbl = document.createElement('label');
      lbl.htmlFor     = uid;
      lbl.textContent = text;

      cb.addEventListener('change', () => {
        const all     = Array.from(group.querySelectorAll('input[type="checkbox"]'));
        answers[field.key] = all.filter(c => c.checked).map(c => c.value);
      });

      group.appendChild(cb);
      group.appendChild(lbl);
    });
    wrapper.appendChild(group);
  }

  // Hint / error span
  const errSpan = document.createElement('span');
  errSpan.className = 'error-msg';
  errSpan.id        = `err-${field.key}`;
  wrapper.appendChild(errSpan);

  return wrapper;
}

// ── Evaluate and toggle conditional field visibility ─────────────────────────
function refreshConditionals() {
  const step = visibleSteps[currentIndex];
  getVisibleFields(step).forEach(field => {
    const wrapper = document.getElementById(`fw-${field.key}`);
    if (!wrapper) return;
    if (field.showIf) {
      const show = field.showIf(answers);
      wrapper.classList.toggle('ob-hidden', !show);
      // Clear value when a conditional field is hidden
      if (!show) delete answers[field.key];
    }
  });
}

// ── Adımı Ekrana Bas ───────────────────────────────────────────────────────
function renderStep() {
  const step  = visibleSteps[currentIndex];
  const total = visibleSteps.length;

  // İlerleme Çubuğu (Progress)
  const pct = (currentIndex / total) * 100;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = `Adım ${currentIndex + 1} / ${total}`;

  // Sağ Panel Dekorasyon
  stepRightTitle.textContent = step.title;
  stepRightDesc.textContent  = step.rightDesc ?? '';

  // Adım Noktaları (Dots)
  stepDots.innerHTML = '';
  visibleSteps.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'ob-dot' +
      (i < currentIndex ? ' done' : i === currentIndex ? ' active' : '');
    stepDots.appendChild(dot);
  });

  // Navigasyon Butonları
  backBtn.style.display = currentIndex === 0 ? 'none' : 'inline-flex';
  nextBtn.textContent   = currentIndex === total - 1 ? 'Kurulumu Tamamla ✓' : 'İleri →';

  // Adım HTML'ini İnşa Et
  stepContainer.innerHTML = '';

  const heading = document.createElement('h1');
  heading.className   = 'auth-heading ob-step-title';
  heading.textContent = step.title;
  stepContainer.appendChild(heading);

  const sub = document.createElement('p');
  sub.className   = 'ob-step-subtitle';
  sub.textContent = step.subtitle ?? '';
  stepContainer.appendChild(sub);

  const fieldsArea = document.createElement('div');
  getVisibleFields(step).forEach(field => {
    fieldsArea.appendChild(buildFieldEl(field));
  });
  stepContainer.appendChild(fieldsArea);

  refreshConditionals();
  setApiMessage('', false);
}

// ── Doğrulama (Validation) ────────────────────────────────────────────────────
function validateStep() {
  const step   = visibleSteps[currentIndex];
  let   passed = true;
  let   firstErrorField = null;

  // Önceki hataları temizle
  stepContainer.querySelectorAll('.error-msg').forEach(el => {
    el.textContent = '';
  });

  getVisibleFields(step).forEach(field => {
    if (!field.required) return;

    // Gizli (conditional) alanları atla
    const wrapper = document.getElementById(`fw-${field.key}`);
    if (!wrapper || wrapper.classList.contains('ob-hidden')) return;

    const val = answers[field.key];
    const empty =
      val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0);

    if (empty) {
      const errEl = document.getElementById(`err-${field.key}`);
      if (errEl) {
        errEl.textContent = 'Bu alan zorunludur.';
        if (!firstErrorField) firstErrorField = wrapper;
      }
      passed = false;
    }
  });

  if (!passed && firstErrorField) {
    firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setApiMessage('Lütfen tüm zorunlu alanları doldurun.', true);
  }

  return passed;
}

// ── Mesaj Yardımcısı ──────────────────────────────────────────────────────────
function setApiMessage(text, isError) {
  if (!apiMessage) return;
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
  apiMessage.style.display = text ? 'block' : 'none';
}

// ── Navigasyon ────────────────────────────────────────────────────────────────
nextBtn.addEventListener('click', async () => {
  if (!validateStep()) return;

  if (currentIndex < visibleSteps.length - 1) {
    currentIndex++;
    renderStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    await submitOnboarding();
  }
});

backBtn.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// ── Gönderim (Submission) ─────────────────────────────────────────────────────
async function submitOnboarding() {
  nextBtn.disabled = true;
  nextBtn.textContent = 'Kaydediliyor...';
  setApiMessage('Profiliniz kaydediliyor, lütfen bekleyin...', false);

  try {
    await api.post('/onboarding', answers);

    // localStorage güncelle
    const stored = getCurrentUser();
    if (stored) {
      stored.onboarding_completed = true;
      localStorage.setItem('user', JSON.stringify(stored));
    }

    progressFill.style.width = '100%';
    setApiMessage(isRetake ? 'Karbon profili başarıyla güncellendi!' : 'Profiliniz kaydedildi! Yönlendiriliyorsunuz...', false);
    
    setTimeout(() => {
      window.location.href = isRetake ? 'profile.html' : 'dashboard.html';
    }, 1000);
  } catch (err) {
    console.error('Onboarding Hatası:', err);
    setApiMessage(err.message || 'Kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.', true);
    nextBtn.disabled = false;
    nextBtn.textContent = currentIndex === visibleSteps.length - 1 ? 'Kurulumu Tamamla ✓' : 'İleri →';
  }
}

// Dark mode enforced by CSS; theme toggle removed

// ── Başlat ────────────────────────────────────────────────────────────────────
renderStep();
