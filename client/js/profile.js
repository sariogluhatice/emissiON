import { emissionService } from './api/emissionService.js';
import { profileService }  from './api/profileService.js';
import { renderLayout } from './layout.js';
import { calculateStats, showToast } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-profile', title: 'Profilim' });
if (!user) throw new Error('redirect');

// ── Human-readable label maps ────────────────────────────────────────────────

const FIELD_LABELS = {
  home_type:               'Housing type',
  household_size:          'Household size',
  is_household_head:       'Household head',
  company_name:            'Company name',
  industry:                'Industry',
  employee_count_range:    'Number of employees',
  department_count_range:  'Number of departments',
  monthly_kwh:             'Monthly electricity',
  heating_type:            'Heating source',
  has_ac:                  'Air conditioning',
  renewable_energy:        'Renewable energy',
  water_saving_devices:    'Water-saving devices',
  office_energy_source:    'Office energy source',
  office_electricity_level:'Office electricity level',
  remote_work_policy:      'Work policy',
  has_car:                 'Car ownership',
  car_fuel_type:           'Car fuel type',
  weekly_km:               'Weekly driving distance',
  carpooling:              'Carpooling / car-sharing',
  has_company_vehicles:    'Company vehicles',
  fleet_fuel:              'Fleet fuel type',
  fleet_size:              'Fleet size',
  public_transport_freq:   'Public transport frequency',
  public_transport_type:   'Public transport type',
  cycles_or_walks:         'Walks or cycles daily',
  taxi_freq:               'Taxi / rideshare usage',
  domestic_flights:        'Domestic flights per year',
  international_flights:   'International flights per year',
  typical_flight_distance: 'Typical flight length',
  has_business_travel:     'Air travel for work',
  diet_type:               'Diet type',
  red_meat_freq:           'Red meat frequency',
  dairy_level:             'Dairy consumption',
  local_food_pref:         'Local / seasonal produce',
  food_waste:              'Food waste level',
  online_shopping_freq:    'Online shopping frequency',
  new_vs_secondhand:       'New vs. second-hand',
  fast_fashion:            'Fast fashion',
  recycling_categories:    'Materials recycled',
  composting:              'Composting',
  waste_bags_week:         'Waste bags per week',
  single_use_plastic:      'Single-use plastic',
  motivation:              'Main motivation',
  priority_area:           'Priority area',
};

// Global value labels (used when no field-specific override applies)
const VALUE_LABELS = {
  apartment:      'Apartment',
  house:          'House',
  detached:       'Detached House',
  shared:         'Shared / Rented',
  dormitory:      'Dormitory',
  natural_gas:    'Natural Gas',
  electricity:    'Electricity',
  coal:           'Coal / Solid Fuel',
  wood:           'Wood / Biomass',
  heat_pump:      'Heat Pump',
  district:       'District Heating',
  solar:          'Solar panels',
  green_plan:     'Green electricity tariff',
  both:           'Both',
  none:           'None / No',
  petrol:         'Petrol',
  diesel:         'Diesel',
  lpg:            'LPG',
  hybrid:         'Hybrid',
  electric:       'Electric',
  '<50':          '< 50 km/week',
  '50-150':       '50–150 km/week',
  '150-300':      '150–300 km/week',
  '300-500':      '300–500 km/week',
  '>500':         '> 500 km/week',
  '<100':         '< 100 kWh/month',
  '100-200':      '100–200 kWh/month',
  '200-400':      '200–400 kWh/month',
  '400-600':      '400–600 kWh/month',
  '>600':         '> 600 kWh/month',
  unknown:        "I don't know",
  daily:          'Daily',
  few_week:       'A few times a week',
  weekly:         'Weekly',
  monthly:        'Monthly',
  rarely:         'Rarely',
  never:          'Never',
  bus:            'Bus',
  metro:          'Metro / Subway',
  train:          'Train / Rail',
  ferry:          'Ferry',
  mixed:          'Mixed',
  '0':            'None',
  '1-2':          '1–2',
  '3-5':          '3–5',
  '6-10':         '6–10',
  '10+':          '10+',
  short:          'Short-haul (< 3 h)',
  medium:         'Medium-haul (3–7 h)',
  long:           'Long-haul (7 h+)',
  vegan:          'Vegan',
  vegetarian:     'Vegetarian',
  pescatarian:    'Pescatarian',
  meat_heavy:     'Meat-heavy',
  high:           'High',
  low:            'Low',
  a_lot:          'A lot',
  some:           'Some',
  little:         'A little',
  minimal:        'Almost none',
  always:         'Always',
  often:          'Often',
  sometimes:      'Sometimes',
  always_new:     'Always new',
  mostly_new:     'Mostly new',
  mostly_used:    'Mostly second-hand',
  yes:            'Yes, regularly',
  paper:          'Paper',
  plastic:        'Plastic',
  glass:          'Glass',
  metal:          'Metal',
  ewaste:         'E-waste',
  save_money:         'Save money',
  reduce_carbon:      'Reduce carbon footprint',
  company_reporting:  'Company reporting / compliance',
  environmental:      'Environmental awareness',
  academic:           'Academic / project use',
  transport:          'Transport',
  energy:             'Home energy',
  flights:            'Flights & travel',
  food:               'Food & diet',
  shopping:           'Shopping',
  waste:              'Waste & recycling',
  supply_chain:       'Supply chain',
  'true':             'Yes',
  'false':            'No',
  grid:               'Grid Electricity',
  renewable:          'Renewable / Green Energy',
  on_site:            'Fully On-Site',
  fully_remote:       'Fully Remote',
  manufacturing:      'Manufacturing',
  technology:         'Technology',
  retail:             'Retail',
  healthcare:         'Healthcare',
  finance:            'Finance',
  education:          'Education',
  construction:       'Construction',
  other:              'Other',
  '1-10':  '1–10',
  '11-50': '11–50',
  '51-200':   '51–200',
  '201-1000': '201–1,000',
  '1000+':    '1,000+',
  '1-3':  '1–3',
  '4-10': '4–10',
  '11-25':'11–25',
  '25+':  '25+',
  '1-5':  '1–5',
  '6-20': '6–20',
  '21-50':'21–50',
  '50+':  '50+',
};

// Field-specific overrides that conflict with the global map
const FIELD_VALUE_LABELS = {
  diet_type: { mixed: 'Mixed / Omnivore' },
  fleet_fuel: {
    petrol:   'Mostly Petrol',
    diesel:   'Mostly Diesel',
    electric: 'Electric Fleet',
    mixed:    'Mixed',
  },
  office_electricity_level: {
    low:       'Low (< 1,000 kWh/mo)',
    medium:    'Medium (1,000–5,000 kWh/mo)',
    high:      'High (5,000–20,000 kWh/mo)',
    very_high: 'Very High (20,000+ kWh/mo)',
  },
  remote_work_policy: {
    on_site:      'Fully On-Site',
    hybrid:       'Hybrid',
    fully_remote: 'Fully Remote',
  },
};

function formatValue(key, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return raw
      .map(v => FIELD_VALUE_LABELS[key]?.[v] ?? VALUE_LABELS[v] ?? v)
      .join(', ');
  }
  const strVal = String(raw);
  return FIELD_VALUE_LABELS[key]?.[strVal] ?? VALUE_LABELS[strVal] ?? strVal;
}

// ── Section definitions ───────────────────────────────────────────────────────

const PROFILE_SECTIONS = [
  {
    id: 'household_details',
    title: 'Household Details',
    icon: '🏠',
    roles: ['individual', 'household'],
    fields: ['home_type', 'household_size', 'is_household_head'],
  },
  {
    id: 'company_details',
    title: 'Company Details',
    icon: '🏭',
    roles: ['company'],
    fields: ['company_name', 'industry', 'employee_count_range', 'department_count_range'],
  },
  {
    id: 'energy',
    title: 'Home & Energy',
    icon: '⚡',
    roles: ['individual', 'household'],
    fields: ['monthly_kwh', 'heating_type', 'has_ac', 'renewable_energy', 'water_saving_devices'],
  },
  {
    id: 'office_energy',
    title: 'Office & Energy',
    icon: '🏢',
    roles: ['company'],
    fields: ['office_energy_source', 'office_electricity_level', 'remote_work_policy'],
  },
  {
    id: 'transport',
    title: 'Transportation',
    icon: '🚗',
    roles: 'all',
    fields: [
      'has_car', 'car_fuel_type', 'weekly_km', 'carpooling',
      'has_company_vehicles', 'fleet_fuel', 'fleet_size',
      'public_transport_freq', 'public_transport_type',
      'cycles_or_walks', 'taxi_freq',
    ],
  },
  {
    id: 'flights',
    title: 'Flights & Travel',
    icon: '✈️',
    roles: 'all',
    fields: ['domestic_flights', 'international_flights', 'typical_flight_distance', 'has_business_travel'],
  },
  {
    id: 'food',
    title: 'Food & Diet',
    icon: '🍽',
    roles: ['individual', 'household'],
    fields: ['diet_type', 'red_meat_freq', 'dairy_level', 'local_food_pref', 'food_waste'],
  },
  {
    id: 'shopping',
    title: 'Shopping & Waste',
    icon: '🛍',
    roles: ['individual', 'household'],
    fields: [
      'online_shopping_freq', 'new_vs_secondhand', 'fast_fashion',
      'recycling_categories', 'composting', 'waste_bags_week', 'single_use_plastic',
    ],
  },
  {
    id: 'goals',
    title: 'Goals & Motivation',
    icon: '🎯',
    roles: 'all',
    fields: ['motivation', 'priority_area'],
  },
];

// ── Rendering helpers ─────────────────────────────────────────────────────────

function renderFieldRow(key, raw) {
  const label   = FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
  const display = formatValue(key, raw);

  const row = document.createElement('div');
  row.className = 'profile-field-row';
  row.innerHTML = `
    <span class="profile-field-label">${label}</span>
    <span class="profile-field-value${display ? '' : ' not-provided'}">${display ?? 'Not provided'}</span>
  `;
  return row;
}

function renderSection(section, answers) {
  // Collect fields that have a value
  const populated = section.fields.filter(key => {
    const v = answers?.[key];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });

  const card = document.createElement('div');
  card.className = 'content-card';

  const header = document.createElement('div');
  header.className = 'profile-section-header';
  header.innerHTML = `
    <span class="profile-section-icon">${section.icon}</span>
    <span class="profile-section-title">${section.title}</span>
    ${populated.length === 0 ? '<span class="profile-section-badge incomplete">Not filled</span>' : ''}
  `;
  card.appendChild(header);

  if (populated.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-section-empty';
    empty.textContent = 'No answers provided for this section.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'profile-field-list';
    populated.forEach(key => list.appendChild(renderFieldRow(key, answers[key])));
    card.appendChild(list);
  }

  return card;
}

// ── Main load ─────────────────────────────────────────────────────────────────

async function loadProfile() {
  try {
    const { user: u, answers } = await profileService.getProfile();

    // Identity card
    const initial = (u.name || u.email || '?').charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent = initial;
    document.getElementById('userInitials').textContent  = initial;
    document.getElementById('userName').textContent      = u.name || u.email || '—';
    document.getElementById('profileName').textContent   = u.name  || '—';
    document.getElementById('profileEmail').textContent  = u.email || '—';
    document.getElementById('profileRole').textContent   = u.role  || '—';

    const since = new Date(u.created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
    document.getElementById('profileSince').textContent = `Member since ${since}`;

    const badge = document.getElementById('obStatusBadge');
    if (u.onboarding_completed) {
      badge.textContent = '✓ Carbon profile complete';
      badge.className = 'profile-ob-badge complete';
    } else {
      badge.textContent = '○ Carbon profile incomplete';
      badge.className = 'profile-ob-badge incomplete';
    }

    // Carbon profile sections
    const container = document.getElementById('carbonProfileContainer');
    container.innerHTML = '';

    if (!answers) {
      const msg = document.createElement('div');
      msg.className = 'content-card';
      msg.innerHTML = `
        <div style="text-align:center;padding:32px;color:var(--color-text-muted)">
          <p style="margin-bottom:16px">Carbon profile not filled yet.</p>
          <a href="onboarding.html" class="btn-primary">Complete carbon profile →</a>
        </div>
      `;
      container.appendChild(msg);
      return;
    }

    // Section heading
    const heading = document.createElement('div');
    heading.className = 'profile-carbon-heading';
    heading.innerHTML = '<span>Carbon Profile</span><a href="carbon-profile.html" class="profile-retake-link">Profili Düzenle →</a>';
    container.appendChild(heading);

    PROFILE_SECTIONS
      .filter(s => s.roles === 'all' || s.roles.includes(u.role))
      .forEach(s => container.appendChild(renderSection(s, answers)));

  } catch (err) {
    console.error('[profile] load error:', err.message);
    showToast('Error', 'Could not load profile data.', 'error');
  }
}

async function loadStats() {
  try {
    const { records } = await emissionService.getAll();
    const stats = calculateStats(records);
    document.getElementById('profileStatTotal').textContent   = stats.total;
    document.getElementById('profileStatMonth').textContent   = stats.month;
    document.getElementById('profileStatEntries').textContent = stats.entries;
  } catch {
    // Non-critical — leave dashes
  }
}

loadProfile();
loadStats();
