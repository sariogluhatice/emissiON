import { TokenManager }   from './api/tokenManager.js';
import { ApiClient }      from './api/apiClient.js';
import { getCurrentUser } from './utils/uiUtils.js';

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
const ALL_STEPS = [

  // ── 1. Profile (role-specific) ───────────────────────────────────────────
  {
    id: 'profile', title: 'Your Profile',
    subtitle: 'Help us understand your situation.',
    icon: '👤', roles: 'all',
    fields: [
      // Individual
      rad('home_type', 'Housing type',
        [['apartment','Apartment'],['house','House'],['detached','Detached House'],
         ['shared','Shared House'],['dormitory','Dormitory']],
        true, ['individual']),
      rad('household_size', 'How many people live in your home (including yourself)?',
        [['1','Just me'],['2','2'],['3','3'],['4','4'],['5','5'],['6+','6+']],
        true, ['individual']),
      // Household
      rad('household_size', 'How many people are in your household?',
        [['2','2'],['3','3'],['4','4'],['5','5'],['6+','6+']],
        true, ['household']),
      rad('is_household_head', 'Are you the household head / primary account holder?',
        [['true','Yes'],['false','No']],
        true, ['household']),
      rad('home_type', 'Home type',
        [['apartment','Apartment'],['house','House'],['detached','Detached House'],['shared','Shared / Rented']],
        true, ['household']),
      // Company
      txt('company_name', 'Company name', true, ['company']),
      sel('industry', 'Industry',
        [['manufacturing','Manufacturing'],['technology','Technology'],['retail','Retail'],
         ['healthcare','Healthcare'],['finance','Finance'],['transportation','Transportation'],
         ['education','Education'],['construction','Construction'],['energy','Energy'],['other','Other']],
        true, ['company']),
      rad('employee_count_range', 'Number of employees',
        [['1-10','1–10'],['11-50','11–50'],['51-200','51–200'],['201-1000','201–1000'],['1000+','1000+']],
        true, ['company']),
      rad('department_count_range', 'Number of departments',
        [['1-3','1–3'],['4-10','4–10'],['11-25','11–25'],['25+','25+']],
        true, ['company']),
    ],
  },

  // ── 2. Home & Energy (individual + household) ───────────────────────────
  {
    id: 'energy', title: 'Home & Energy',
    subtitle: 'Home energy is typically the largest slice of a personal carbon footprint.',
    icon: '⚡', roles: IH,
    fields: [
      sel('monthly_kwh', 'Estimated monthly electricity usage',
        [['<100','Less than 100 kWh'],['100-200','100–200 kWh'],['200-400','200–400 kWh'],
         ['400-600','400–600 kWh'],['>600','Over 600 kWh'],['unknown','I don\'t know']]),
      sel('heating_type', 'Primary heating source',
        [['natural_gas','Natural Gas'],['electricity','Electricity'],['coal','Coal / Solid Fuel'],
         ['wood','Wood / Biomass'],['heat_pump','Heat Pump'],['district','District Heating'],['none','No heating']]),
      rad('has_ac', 'Do you use air conditioning?',
        [['true','Yes'],['false','No']]),
      sel('renewable_energy', 'Renewable energy at home',
        [['solar','Solar panels'],['green_plan','Green electricity tariff'],['both','Both'],['none','Neither']]),
      rad('water_saving_devices', 'Do you use water-saving devices (low-flow taps etc.)?',
        [['true','Yes'],['false','No']], false),
    ],
  },

  // ── 3. Office Energy (company only) ─────────────────────────────────────
  {
    id: 'office_energy', title: 'Office & Energy',
    subtitle: 'Tell us about your company\'s energy use.',
    icon: '🏢', roles: ['company'],
    fields: [
      sel('office_energy_source', 'Primary office energy source',
        [['grid','Grid Electricity'],['natural_gas','Natural Gas + Electricity'],
         ['renewable','Renewable / Green Energy'],['mixed','Mixed Sources']]),
      rad('office_electricity_level', 'Estimated office electricity consumption',
        [['low','Low (small office, < 1,000 kWh/mo)'],['medium','Medium (1,000–5,000 kWh/mo)'],
         ['high','High (5,000–20,000 kWh/mo)'],['very_high','Very High (20,000+ kWh/mo)']]),
      rad('remote_work_policy', 'Employee work policy',
        [['on_site','Fully On-Site'],['hybrid','Hybrid'],['fully_remote','Fully Remote']], false),
    ],
  },

  // ── 4. Transportation ────────────────────────────────────────────────────
  {
    id: 'transport', title: 'Transportation',
    subtitle: 'How do you and your household get around day-to-day?',
    icon: '🚗', roles: 'all',
    fields: [
      // Individual / household
      rad('has_car', 'Do you own or regularly use a car?',
        [['true','Yes'],['false','No']],
        true, IH),
      rad('car_fuel_type', 'Vehicle fuel type',
        [['petrol','Petrol'],['diesel','Diesel'],['lpg','LPG'],['hybrid','Hybrid'],['electric','Electric']],
        true, IH, a => a.has_car === 'true'),
      rad('weekly_km', 'Average kilometres driven per week',
        [['<50','< 50 km'],['50-150','50–150 km'],['150-300','150–300 km'],
         ['300-500','300–500 km'],['>500','> 500 km']],
        false, IH, a => a.has_car === 'true'),
      rad('carpooling', 'Do you carpool or car-share?',
        [['true','Yes'],['false','No']],
        false, IH, a => a.has_car === 'true'),
      // Shared
      sel('public_transport_freq', 'Public transport frequency',
        [['daily','Daily'],['few_week','A few times a week'],['weekly','Weekly'],['rarely','Rarely'],['never','Never']]),
      rad('public_transport_type', 'Main public transport type',
        [['bus','Bus'],['metro','Metro / Subway'],['train','Train / Rail'],['ferry','Ferry'],['mixed','Mixed']],
        false, 'all', a => a.public_transport_freq !== 'never' && !!a.public_transport_freq),
      rad('cycles_or_walks', 'Do you regularly walk or cycle for daily trips?',
        [['true','Yes'],['false','No']],
        true, IH),
      sel('taxi_freq', 'Taxi / rideshare usage',
        [['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['rarely','Rarely'],['never','Never']],
        false, IH),
      // Company
      rad('has_company_vehicles', 'Does your company operate vehicles?',
        [['true','Yes'],['false','No']],
        true, ['company']),
      rad('fleet_fuel', 'Fleet fuel type',
        [['petrol','Mostly Petrol'],['diesel','Mostly Diesel'],['electric','Electric Fleet'],['mixed','Mixed']],
        false, ['company'], a => a.has_company_vehicles === 'true'),
      rad('fleet_size', 'Fleet size (vehicles)',
        [['1-5','1–5'],['6-20','6–20'],['21-50','21–50'],['50+','50+']],
        false, ['company'], a => a.has_company_vehicles === 'true'),
    ],
  },

  // ── 5. Flights & Travel ──────────────────────────────────────────────────
  {
    id: 'flights', title: 'Flights & Travel',
    subtitle: 'Aviation is one of the most carbon-intensive activities per kilometre.',
    icon: '✈️', roles: 'all',
    fields: [
      rad('domestic_flights', 'Domestic flights per year',
        [['0','None'],['1-2','1–2'],['3-5','3–5'],['6-10','6–10'],['10+','10+']]),
      rad('international_flights', 'International flights per year',
        [['0','None'],['1-2','1–2'],['3-5','3–5'],['6-10','6–10'],['10+','10+']]),
      rad('typical_flight_distance', 'Typical flight length (if you fly)',
        [['short','Short-haul (< 3 h)'],['medium','Medium-haul (3–7 h)'],['long','Long-haul (7 h+)']],
        false, 'all', a => a.domestic_flights !== '0' || a.international_flights !== '0'),
      rad('has_business_travel', 'Do you travel by air for work?',
        [['true','Yes'],['false','No']], false),
    ],
  },

  // ── 6. Food & Diet (individual + household) ──────────────────────────────
  {
    id: 'food', title: 'Food & Diet',
    subtitle: 'Diet accounts for 10–30 % of the average household carbon footprint.',
    icon: '🍽', roles: IH,
    fields: [
      rad('diet_type', 'How would you describe your diet?',
        [['vegan','Vegan'],['vegetarian','Vegetarian'],['pescatarian','Pescatarian'],
         ['mixed','Mixed / Omnivore'],['meat_heavy','Meat-heavy']]),
      sel('red_meat_freq', 'How often do you eat red meat?',
        [['daily','Daily'],['few_week','A few times a week'],['weekly','Weekly'],
         ['monthly','Monthly'],['rarely','Rarely / never']],
        false, IH, a => !['vegan','vegetarian','pescatarian'].includes(a.diet_type) && !!a.diet_type),
      rad('dairy_level', 'Dairy consumption',
        [['high','High'],['medium','Medium'],['low','Low'],['none','None']],
        false, IH, a => a.diet_type !== 'vegan' && !!a.diet_type),
      rad('local_food_pref', 'Do you prefer local or seasonal produce?',
        [['always','Always'],['often','Often'],['sometimes','Sometimes'],['rarely','Rarely']], false),
      rad('food_waste', 'How much food do you typically waste?',
        [['a_lot','A lot'],['some','Some'],['little','A little'],['minimal','Almost none']], false),
    ],
  },

  // ── 7. Shopping & Waste (individual + household) ─────────────────────────
  {
    id: 'shopping', title: 'Shopping & Waste',
    subtitle: 'Consumption and recycling habits complete your footprint picture.',
    icon: '🛍', roles: IH,
    fields: [
      rad('online_shopping_freq', 'Online shopping frequency',
        [['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['rarely','Rarely']]),
      rad('new_vs_secondhand', 'New vs. second-hand preference',
        [['always_new','Always new'],['mostly_new','Mostly new'],
         ['mixed','Mix of both'],['mostly_used','Mostly second-hand']]),
      rad('fast_fashion', 'Do you buy fast fashion?',
        [['yes','Yes, regularly'],['sometimes','Sometimes'],['no','Rarely / never']], false),
      chk('recycling_categories', 'Which materials do you recycle? (select all that apply)',
        [['paper','Paper'],['plastic','Plastic'],['glass','Glass'],
         ['metal','Metal'],['ewaste','E-waste'],['none','I don\'t recycle currently']]),
      rad('composting', 'Do you compost food/garden waste?',
        [['true','Yes'],['false','No']], false),
      rad('waste_bags_week', 'General waste bags put out per week',
        [['1','1 bag'],['2','2 bags'],['3','3 bags'],['4+','4 or more']], false),
      rad('single_use_plastic', 'Single-use plastic frequency',
        [['daily','Daily'],['weekly','Weekly'],['sometimes','Sometimes'],['rarely','Rarely'],['never','Never']], false),
    ],
  },

  // ── 8. Goals ─────────────────────────────────────────────────────────────
  {
    id: 'goals', title: 'Your Goals',
    subtitle: 'We\'ll tailor your dashboard and suggestions to what matters most to you.',
    icon: '🎯', roles: 'all',
    fields: [
      rad('motivation', 'What is your main motivation for tracking emissions?',
        [['save_money','Save money'],['reduce_carbon','Reduce my carbon footprint'],
         ['company_reporting','Company reporting / compliance'],
         ['environmental','Environmental awareness'],['academic','Academic / project use']]),
      rad('priority_area', 'Which area do you most want to improve first?',
        [['transport','Transport'],['energy','Home energy'],['flights','Flights & travel'],
         ['food','Food & diet'],['shopping','Shopping'],['waste','Waste & recycling'],
         ['supply_chain','Supply chain']]),
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
const stepIcon      = document.getElementById('stepIcon');
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
    ph.value = ''; ph.textContent = 'Select…';
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

// ── Render current step ───────────────────────────────────────────────────────
function renderStep() {
  const step  = visibleSteps[currentIndex];
  const total = visibleSteps.length;

  // Progress bar
  const pct = (currentIndex / total) * 100;
  progressFill.style.width = `${pct}%`;
  progressLabel.textContent = `Step ${currentIndex + 1} of ${total}`;

  // Right panel decorations
  stepIcon.textContent       = step.icon ?? '🌿';
  stepRightTitle.textContent = step.title;
  stepRightDesc.textContent  = step.subtitle ?? '';

  // Step dots
  stepDots.innerHTML = '';
  visibleSteps.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'ob-dot' +
      (i < currentIndex ? ' done' : i === currentIndex ? ' active' : '');
    stepDots.appendChild(dot);
  });

  // Nav buttons
  backBtn.style.display = currentIndex === 0 ? 'none' : 'inline-flex';
  nextBtn.textContent   = currentIndex === total - 1 ? 'Complete Setup ✓' : 'Next →';

  // Build step HTML
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

  // Apply initial conditional visibility
  refreshConditionals();

  setApiMessage('', false);
}

// ── Validation ────────────────────────────────────────────────────────────────
function validateStep() {
  const step   = visibleSteps[currentIndex];
  let   passed = true;

  // Clear previous errors
  stepContainer.querySelectorAll('.error-msg').forEach(el => {
    el.textContent = '';
  });

  getVisibleFields(step).forEach(field => {
    if (!field.required) return;

    // Skip hidden conditional fields
    const wrapper = document.getElementById(`fw-${field.key}`);
    if (!wrapper || wrapper.classList.contains('ob-hidden')) return;

    const val = answers[field.key];
    const empty =
      val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0);

    if (empty) {
      const errEl = document.getElementById(`err-${field.key}`);
      if (errEl) errEl.textContent = 'Please make a selection.';
      if (!passed) return; // already failing, just mark the rest
      passed = false;
    }
  });

  return passed;
}

// ── Message helper ────────────────────────────────────────────────────────────
function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

// ── Navigation handlers ───────────────────────────────────────────────────────
nextBtn.addEventListener('click', async () => {
  if (!validateStep()) return;

  if (currentIndex < visibleSteps.length - 1) {
    currentIndex++;
    renderStep();
    stepContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    await submitOnboarding();
  }
});

backBtn.addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    renderStep();
  }
});

// ── Submission ────────────────────────────────────────────────────────────────
async function submitOnboarding() {
  nextBtn.disabled = true;
  setApiMessage('Saving your profile…', false);

  try {
    await api.post('/onboarding', answers);

    // Reflect completed state in localStorage
    const stored = getCurrentUser();
    if (stored) {
      stored.onboarding_completed = true;
      localStorage.setItem('user', JSON.stringify(stored));
    }

    // Fill progress bar to 100 %
    progressFill.style.width = '100%';
    progressLabel.textContent = 'Complete!';

    setApiMessage(isRetake ? 'Carbon profile updated!' : 'Profile saved! Taking you to your dashboard…', false);
    setTimeout(() => {
      window.location.href = isRetake ? 'profile.html' : 'dashboard.html';
    }, 1200);
  } catch (err) {
    setApiMessage(err.message || 'Something went wrong. Please try again.', true);
    nextBtn.disabled = false;
  }
}

// ── Kick off ──────────────────────────────────────────────────────────────────
renderStep();
