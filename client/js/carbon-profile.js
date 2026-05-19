import { renderLayout } from './layout.js';
import { showToast }    from './utils/uiUtils.js';
import { ApiClient }    from './api/apiClient.js';

const user = renderLayout({ activeNav: 'nav-profile', title: 'Karbon Profilini Düzenle' });
if (!user) throw new Error('redirect');

const role = user.role ?? 'individual';
const api  = new ApiClient();

// Mevcut cevaplar (API'dan yüklenir, form değişikliklerinde güncellenir)
let answers = {};

// Koşullu alan kayıtları (showIf fonksiyonlarını tutar)
const conditionalRegistry = [];

// ── Alan tanım yardımcıları ──────────────────────────────────────────────────
const sel = (key, label, options, roles = 'all', showIf = null) =>
    ({ key, label, type: 'select',         options, roles, showIf });
const rad = (key, label, options, roles = 'all', showIf = null) =>
    ({ key, label, type: 'radio',          options, roles, showIf });
const chk = (key, label, options, roles = 'all') =>
    ({ key, label, type: 'checkbox-group', options, roles, showIf: null });
const txt = (key, label, roles = 'all') =>
    ({ key, label, type: 'text',           options: null, roles, showIf: null });

const IH = ['individual', 'household'];

// ── Bölüm ve alan tanımları (onboarding ile aynı seçenekler) ─────────────────
const ALL_SECTIONS = [
    {
        id: 'profile_info', title: 'Profil Bilgileri', icon: '👤', roles: 'all',
        fields: [
            // Bireysel konut
            rad('home_type', 'Konut Tipi',
                [['apartment','Apartman Dairesi'],['house','Müstakil Ev'],
                 ['detached','Villa / Köşk'],['shared','Paylaşımlı Ev'],['dormitory','Öğrenci Yurdu']],
                ['individual']),
            rad('household_size', 'Evde kaç kişi yaşıyorsunuz?',
                [['1','Sadece Ben'],['2','2'],['3','3'],['4','4'],['5','5'],['6+','6+']],
                ['individual']),
            // Hane konut
            rad('home_type', 'Ev Tipi',
                [['apartment','Apartman Dairesi'],['house','Müstakil Ev'],
                 ['detached','Villa / Köşk'],['shared','Paylaşımlı / Kiralık Oda']],
                ['household']),
            rad('household_size', 'Hane halkı kaç kişiden oluşuyor?',
                [['2','2'],['3','3'],['4','4'],['5','5'],['6+','6+']],
                ['household']),
            rad('is_household_head', 'Hanenin birincil hesap sahibi misiniz?',
                [['true','Evet'],['false','Hayır']],
                ['household']),
            // Şirket bilgileri
            txt('company_name', 'Şirket Adı', ['company']),
            sel('industry', 'Sektör',
                [['manufacturing','Üretim'],['technology','Teknoloji'],['retail','Perakende'],
                 ['healthcare','Sağlık'],['finance','Finans'],['transportation','Ulaşım'],
                 ['education','Eğitim'],['construction','İnşaat'],['energy','Enerji'],['other','Diğer']],
                ['company']),
            rad('employee_count_range', 'Çalışan Sayısı',
                [['1-10','1–10'],['11-50','11–50'],['51-200','51–200'],['201-1000','201–1000'],['1000+','1000+']],
                ['company']),
            rad('department_count_range', 'Departman Sayısı',
                [['1-3','1–3'],['4-10','4–10'],['11-25','11–25'],['25+','25+']],
                ['company']),
        ],
    },
    {
        id: 'energy', title: 'Ev & Enerji', icon: '⚡', roles: IH,
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
            rad('water_saving_devices', 'Su tasarrufu sağlayan cihazlar kullanıyor musunuz?',
                [['true','Evet'],['false','Hayır']],
                ['individual']),
        ],
    },
    {
        id: 'office_energy', title: 'Ofis & Enerji', icon: '🏢', roles: ['company'],
        fields: [
            sel('office_energy_source', 'Birincil ofis enerji kaynağı',
                [['grid','Şebeke Elektriği'],['natural_gas','Doğalgaz + Elektrik'],
                 ['renewable','Yenilenebilir / Yeşil Enerji'],['mixed','Karma Kaynaklar']]),
            rad('office_electricity_level', 'Tahmini ofis elektrik tüketimi',
                [['low','Düşük (< 1.000 kWh/ay)'],['medium','Orta (1.000–5.000 kWh/ay)'],
                 ['high','Yüksek (5.000–20.000 kWh/ay)'],['very_high','Çok Yüksek (20.000+ kWh/ay)']]),
            rad('remote_work_policy', 'Çalışma politikası',
                [['on_site','Tamamen Ofisten'],['hybrid','Hibrit'],['fully_remote','Tamamen Uzaktan']]),
        ],
    },
    {
        id: 'transport', title: 'Ulaşım', icon: '🚗', roles: 'all',
        fields: [
            rad('has_car', 'Düzenli olarak araç kullanıyor musunuz?',
                [['true','Evet'],['false','Hayır']],
                IH),
            rad('car_fuel_type', 'Araç yakıt tipi',
                [['petrol','Benzin'],['diesel','Dizel'],['lpg','LPG'],['hybrid','Hibrit'],['electric','Elektrikli']],
                IH, a => a.has_car === 'true'),
            rad('weekly_km', 'Haftalık ortalama sürüş mesafesi',
                [['<50','< 50 km'],['50-150','50–150 km'],['150-300','150–300 km'],
                 ['300-500','300–500 km'],['>500','> 500 km']],
                IH, a => a.has_car === 'true'),
            rad('carpooling', 'Araç paylaşımı kullanıyor musunuz?',
                [['true','Evet'],['false','Hayır']],
                IH, a => a.has_car === 'true'),
            sel('public_transport_freq', 'Toplu taşıma kullanım sıklığı',
                [['daily','Günlük'],['few_week','Haftada birkaç kez'],['weekly','Haftalık'],
                 ['rarely','Nadiren'],['never','Hiçbir zaman']]),
            rad('public_transport_type', 'Ana toplu taşıma türü',
                [['bus','Otobüs'],['metro','Metro / Metrobüs'],['train','Tren / Raylı Sistem'],
                 ['ferry','Vapur'],['mixed','Karma']],
                'all', a => a.public_transport_freq && a.public_transport_freq !== 'never'),
            rad('cycles_or_walks', 'Düzenli olarak yürüyor veya bisiklete biniyor musunuz?',
                [['true','Evet'],['false','Hayır']],
                IH),
            sel('taxi_freq', 'Taksi / Uber kullanım sıklığı',
                [['daily','Günlük'],['weekly','Haftalık'],['monthly','Aylık'],
                 ['rarely','Nadiren'],['never','Hiçbir zaman']],
                IH),
            rad('has_company_vehicles', 'Şirketinizin araç filosu var mı?',
                [['true','Evet'],['false','Hayır']],
                ['company']),
            rad('fleet_fuel', 'Filo yakıt tipi',
                [['petrol','Ağırlıklı Benzin'],['diesel','Ağırlıklı Dizel'],
                 ['electric','Elektrikli Filo'],['mixed','Karma']],
                ['company'], a => a.has_company_vehicles === 'true'),
            rad('fleet_size', 'Filo boyutu (araç sayısı)',
                [['1-5','1–5'],['6-20','6–20'],['21-50','21–50'],['50+','50+']],
                ['company'], a => a.has_company_vehicles === 'true'),
        ],
    },
    {
        id: 'flights', title: 'Uçuş & Seyahat', icon: '✈️', roles: 'all',
        fields: [
            rad('domestic_flights', 'Yıllık yurt içi uçuş sayısı',
                [['0','Hiç'],['1-2','1–2'],['3-5','3–5'],['6-10','6–10'],['10+','10+']]),
            rad('international_flights', 'Yıllık yurt dışı uçuş sayısı',
                [['0','Hiç'],['1-2','1–2'],['3-5','3–5'],['6-10','6–10'],['10+','10+']]),
            rad('typical_flight_distance', 'Tipik uçuş süresi',
                [['short','Kısa Mesafe (< 3 sa)'],['medium','Orta Mesafe (3–7 sa)'],['long','Uzun Mesafe (7 sa+)']],
                'all',
                a => (a.domestic_flights && a.domestic_flights !== '0') ||
                     (a.international_flights && a.international_flights !== '0')),
            rad('has_business_travel', 'İş amaçlı hava yoluyla seyahat ediyor musunuz?',
                [['true','Evet'],['false','Hayır']],
                'all',
                a => (a.domestic_flights && a.domestic_flights !== '0') ||
                     (a.international_flights && a.international_flights !== '0')),
        ],
    },
    {
        id: 'food', title: 'Gıda & Beslenme', icon: '🍽', roles: IH,
        fields: [
            rad('diet_type', 'Beslenme tarzınızı nasıl tanımlarsınız?',
                [['vegan','Vegan'],['vegetarian','Vejetaryen'],['pescatarian','Pesketaryen'],
                 ['mixed','Karma / Her şeyi yiyen'],['meat_heavy','Et ağırlıklı']]),
            sel('red_meat_freq', 'Ne sıklıkla kırmızı et tüketirsiniz?',
                [['daily','Günlük'],['few_week','Haftada birkaç kez'],['weekly','Haftalık'],
                 ['monthly','Aylık'],['rarely','Nadiren / Hiç']],
                IH, a => a.diet_type && !['vegan','vegetarian','pescatarian'].includes(a.diet_type)),
            rad('dairy_level', 'Süt ve süt ürünü tüketimi',
                [['high','Yüksek'],['medium','Orta'],['low','Düşük'],['none','Hiç']],
                IH, a => a.diet_type && a.diet_type !== 'vegan'),
            rad('local_food_pref', 'Yerel veya mevsimsel ürünleri tercih eder misiniz?',
                [['always','Her zaman'],['often','Sık sık'],['sometimes','Bazen'],['rarely','Nadiren']]),
            rad('food_waste', 'Genellikle ne kadar gıda israf edersiniz?',
                [['a_lot','Çok fazla'],['some','Biraz'],['little','Çok az'],['minimal','Neredeyse hiç']]),
        ],
    },
    {
        id: 'shopping', title: 'Alışveriş & Atık', icon: '🛍', roles: IH,
        fields: [
            rad('online_shopping_freq', 'Online alışveriş sıklığı',
                [['daily','Günlük'],['weekly','Haftalık'],['monthly','Aylık'],['rarely','Nadiren']]),
            rad('new_vs_secondhand', 'Yeni mi yoksa ikinci el mi tercih edersiniz?',
                [['always_new','Her zaman yeni'],['mostly_new','Çoğunlukla yeni'],
                 ['mixed','Karma'],['mostly_used','Çoğunlukla ikinci el']]),
            rad('fast_fashion', 'Hızlı moda markalarından alışveriş yapar mısınız?',
                [['yes','Evet, düzenli olarak'],['sometimes','Bazen'],['no','Nadiren / Hiç']]),
            chk('recycling_categories', 'Hangi malzemeleri geri dönüştürürsünüz?',
                [['paper','Kağıt'],['plastic','Plastik'],['glass','Cam'],
                 ['metal','Metal'],['ewaste','E-atık'],['none','Şu an geri dönüşüm yapmıyorum']]),
            rad('composting', 'Kompost yapıyor musunuz?',
                [['true','Evet'],['false','Hayır']]),
            rad('waste_bags_week', 'Haftalık çıkan çöp torbası sayısı',
                [['1','1 torba'],['2','2 torba'],['3','3 torba'],['4+','4 veya daha fazla']]),
            rad('single_use_plastic', 'Tek kullanımlık plastik kullanım sıklığı',
                [['daily','Günlük'],['weekly','Haftalık'],['sometimes','Bazen'],
                 ['rarely','Nadiren'],['never','Hiçbir zaman']]),
        ],
    },
    {
        id: 'goals', title: 'Hedefler', icon: '🎯', roles: 'all',
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

// ── Koşullu alan görünürlüğünü yenile ────────────────────────────────────────
function refreshConditionals() {
    conditionalRegistry.forEach(({ wrapper, showIf }) => {
        const show = showIf(answers);
        wrapper.style.display = show ? '' : 'none';
        if (!show) {
            // Gizlenen alana ait radio/select değerini sıfırla
            const key = wrapper.dataset.fieldKey;
            if (key) delete answers[key];
        }
    });
}

// ── Tek alan elementi oluştur ─────────────────────────────────────────────────
function buildField(field, sectionId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ob-field-wrapper';
    wrapper.dataset.fieldKey = field.key;

    const label = document.createElement('label');
    label.className   = 'label';
    label.textContent = field.label;
    wrapper.appendChild(label);

    if (field.type === 'text') {
        const input = document.createElement('input');
        input.className = 'input';
        input.type      = 'text';
        input.value     = answers[field.key] ?? '';
        input.addEventListener('input', () => { answers[field.key] = input.value; });
        wrapper.appendChild(input);

    } else if (field.type === 'select') {
        const select = document.createElement('select');
        select.className = 'input';

        const ph = document.createElement('option');
        ph.value = ''; ph.textContent = 'Seçiniz…';
        select.appendChild(ph);

        field.options.forEach(([val, text]) => {
            const opt = document.createElement('option');
            opt.value       = val;
            opt.textContent = text;
            if (answers[field.key] === val) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', () => {
            answers[field.key] = select.value || undefined;
            refreshConditionals();
        });
        wrapper.appendChild(select);

    } else if (field.type === 'radio') {
        const group = document.createElement('div');
        group.className = 'radio-group';

        field.options.forEach(([val, text]) => {
            const uid   = `${sectionId}-${field.key}-${val}`;
            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.id    = uid;
            radio.name  = field.key;
            radio.value = val;
            if (String(answers[field.key]) === val) radio.checked = true;

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
            const uid = `${sectionId}-${field.key}-${val}`;
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
                const all = Array.from(group.querySelectorAll('input[type="checkbox"]'));
                answers[field.key] = all.filter(c => c.checked).map(c => c.value);
            });

            group.appendChild(cb);
            group.appendChild(lbl);
        });
        wrapper.appendChild(group);
    }

    // Koşullu görünürlük kaydı
    if (field.showIf) {
        conditionalRegistry.push({ wrapper, showIf: field.showIf });
        if (!field.showIf(answers)) wrapper.style.display = 'none';
    }

    return wrapper;
}

// ── Bir bölüm kartı oluştur ───────────────────────────────────────────────────
function buildSection(section) {
    const visibleFields = section.fields.filter(
        f => f.roles === 'all' || f.roles.includes(role)
    );
    if (visibleFields.length === 0) return null;

    const card = document.createElement('div');
    card.className = 'content-card glass-card';
    card.style.marginBottom = '24px';

    const header = document.createElement('div');
    header.className = 'content-card-header';
    header.innerHTML = `<span class="content-card-title">${section.title}</span>`;
    card.appendChild(header);

    const body = document.createElement('div');
    body.style.cssText = 'padding: 8px 20px 20px';

    visibleFields.forEach(f => body.appendChild(buildField(f, section.id)));
    card.appendChild(body);
    return card;
}

// ── Formu render et ───────────────────────────────────────────────────────────
function renderForm() {
    const container = document.getElementById('cpFormContainer');
    container.innerHTML = '';
    conditionalRegistry.length = 0;

    const visibleSections = ALL_SECTIONS.filter(
        s => s.roles === 'all' || s.roles.includes(role)
    );

    visibleSections.forEach(s => {
        const card = buildSection(s);
        if (card) container.appendChild(card);
    });

    // Kaydet butonu
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex; justify-content:flex-end; align-items:center; margin-top:8px;';

    const saveBtn = document.createElement('button');
    saveBtn.id        = 'saveBtn';
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Kaydet';
    saveBtn.style.minWidth = '140px';
    saveBtn.addEventListener('click', saveCarbonProfile);

    footer.appendChild(saveBtn);
    container.appendChild(footer);
}

// ── Kaydet ────────────────────────────────────────────────────────────────────
async function saveCarbonProfile() {
    const btn = document.getElementById('saveBtn');
    if (!btn) return;

    btn.disabled    = true;
    btn.textContent = 'Kaydediliyor…';

    try {
        await api.put('/carbon-profile', answers);
        showToast('Başarılı', 'Profil başarıyla güncellendi', 'success');
    } catch (err) {
        console.error('[carbon-profile] kayıt hatası:', err.message);
        showToast('Hata', 'Güncelleme sırasında hata oluştu', 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Kaydet';
    }
}

// ── Başlat ────────────────────────────────────────────────────────────────────
async function init() {
    try {
        const data = await api.get('/carbon-profile');
        if (data.answers && typeof data.answers === 'object') {
            Object.assign(answers, data.answers);
        }
    } catch (err) {
        console.error('[carbon-profile] veri yükleme hatası:', err.message);
        showToast('Uyarı', 'Mevcut veriler yüklenemedi, boş form açılıyor', 'info');
    }
    renderForm();
}

init();
