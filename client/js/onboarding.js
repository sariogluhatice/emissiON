import { TokenManager }  from './api/tokenManager.js';
import { ApiClient }     from './api/apiClient.js';
import { getCurrentUser } from './utils/uiUtils.js';

// --- Auth guard ---
if (!TokenManager.exists()) {
  window.location.replace('login.html');
}

const user = getCurrentUser();

// Skip onboarding if already completed or no user object
if (!user || user.onboarding_completed === true) {
  window.location.replace('dashboard.html');
}

const role = user?.role ?? 'individual';
const api  = new ApiClient();

// --- Field definitions per role ---

const BOOL_OPTIONS = [['true', 'Yes'], ['false', 'No']];

const FIELDS = {
  individual: [
    {
      key: 'has_car',
      label: 'Do you own a car?',
      type: 'bool-select',
    },
    {
      key: 'commute_mode',
      label: 'How do you usually commute?',
      type: 'select',
      options: [
        ['car',              'Car'],
        ['public_transport', 'Public Transport'],
        ['bicycle',          'Bicycle'],
        ['walking',          'Walking'],
        ['remote',           'Remote / Work from Home'],
      ],
    },
    {
      key: 'flights_per_year_range',
      label: 'How many flights do you take per year?',
      type: 'select',
      options: [
        ['0',   'None'],
        ['1-3', '1–3'],
        ['4-10','4–10'],
        ['10+', 'More than 10'],
      ],
    },
    {
      key: 'lives_alone',
      label: 'Do you live alone?',
      type: 'bool-select',
    },
    {
      key: 'priority_area',
      label: 'Which area do you most want to reduce?',
      type: 'select',
      options: [
        ['transport', 'Transport'],
        ['energy',    'Energy'],
        ['food',      'Food'],
        ['shopping',  'Shopping'],
        ['other',     'Other'],
      ],
    },
  ],

  household: [
    {
      key: 'household_size',
      label: 'How many people live in your household?',
      type: 'select',
      options: [
        ['1',  '1'],
        ['2',  '2'],
        ['3',  '3'],
        ['4',  '4'],
        ['5',  '5'],
        ['6+', '6 or more'],
      ],
    },
    {
      key: 'home_type',
      label: 'What type of home do you live in?',
      type: 'select',
      options: [
        ['apartment', 'Apartment'],
        ['house',     'House'],
        ['detached',  'Detached House'],
        ['other',     'Other'],
      ],
    },
    {
      key: 'has_regular_vehicle_use',
      label: 'Does your household regularly use a vehicle?',
      type: 'bool-select',
    },
    {
      key: 'data_entry_preference',
      label: 'How would you prefer to log emissions?',
      type: 'select',
      options: [
        ['manual', 'Enter manually'],
        ['ocr',    'Upload bills (OCR)'],
        ['both',   'Both'],
      ],
    },
    {
      key: 'priority_area',
      label: 'Which area does your household want to focus on?',
      type: 'select',
      options: [
        ['energy',    'Energy'],
        ['transport', 'Transport'],
        ['waste',     'Waste'],
        ['water',     'Water'],
        ['other',     'Other'],
      ],
    },
  ],

  company: [
    {
      key:      'company_name',
      label:    'Company name',
      type:     'text',
      required: true,
    },
    {
      key: 'industry',
      label: 'Industry',
      type: 'select',
      options: [
        ['manufacturing', 'Manufacturing'],
        ['technology',    'Technology'],
        ['retail',        'Retail'],
        ['healthcare',    'Healthcare'],
        ['finance',       'Finance'],
        ['transportation','Transportation'],
        ['education',     'Education'],
        ['other',         'Other'],
      ],
    },
    {
      key: 'employee_count_range',
      label: 'Number of employees',
      type: 'select',
      options: [
        ['1-10',     '1–10'],
        ['11-50',    '11–50'],
        ['51-200',   '51–200'],
        ['201-1000', '201–1000'],
        ['1000+',    'More than 1000'],
      ],
    },
    {
      key: 'has_company_vehicles',
      label: 'Does your company operate vehicles?',
      type: 'bool-select',
    },
    {
      key: 'priority_area',
      label: 'Which area does your company want to focus on?',
      type: 'select',
      options: [
        ['energy',        'Energy'],
        ['transport',     'Transport'],
        ['supply_chain',  'Supply Chain'],
        ['waste',         'Waste'],
        ['other',         'Other'],
      ],
    },
  ],
};

const ROLE_HEADINGS = {
  individual: 'Tell us about yourself',
  household:  'Tell us about your household',
  company:    'Set up your company profile',
};

const ROLE_SUBTEXTS = {
  individual: 'Help us personalise your carbon tracking experience.',
  household:  'We\'ll tailor emission categories and tips to your household.',
  company:    'We\'ll configure your account for company-wide emission tracking.',
};

// --- Render heading and subtext ---
const headingEl  = document.getElementById('onboardingHeading');
const subtextEl  = document.getElementById('onboardingSubtext');
if (headingEl) headingEl.textContent = ROLE_HEADINGS[role] ?? 'Set up your account';
if (subtextEl) subtextEl.textContent = ROLE_SUBTEXTS[role] ?? '';

// --- Render form fields ---
const container  = document.getElementById('formFields');
const roleFields = FIELDS[role] ?? [];

roleFields.forEach(({ key, label, type, options, required }) => {
  const group = document.createElement('div');
  group.className = 'form-group';

  const lbl = document.createElement('label');
  lbl.className = 'label';
  lbl.setAttribute('for', key);
  lbl.textContent = label;
  group.appendChild(lbl);

  if (type === 'text') {
    const input = document.createElement('input');
    input.className   = 'input';
    input.type        = 'text';
    input.id          = key;
    input.name        = key;
    if (required) input.required = true;
    group.appendChild(input);
  } else {
    const select = document.createElement('select');
    select.className = 'input';
    select.id        = key;
    select.name      = key;

    const placeholder = document.createElement('option');
    placeholder.value       = '';
    placeholder.textContent = 'Select…';
    select.appendChild(placeholder);

    const opts = type === 'bool-select' ? BOOL_OPTIONS : options;
    opts.forEach(([val, text]) => {
      const opt = document.createElement('option');
      opt.value       = val;
      opt.textContent = text;
      select.appendChild(opt);
    });

    group.appendChild(select);
  }

  container.appendChild(group);
});

// --- Submit handler ---
const form       = document.getElementById('onboardingForm');
const submitBtn  = document.getElementById('submitBtn');
const apiMessage = document.getElementById('apiMessage');

function setApiMessage(text, isError) {
  apiMessage.textContent = text;
  apiMessage.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

function parseFieldValue(key, raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  if (key === 'household_size' && raw !== '6+') {
    const n = parseInt(raw, 10);
    return isNaN(n) ? raw : n;
  }
  return raw;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {};
  roleFields.forEach(({ key }) => {
    const el = document.getElementById(key);
    if (el) payload[key] = parseFieldValue(key, el.value);
  });

  if (role === 'company' && !payload.company_name) {
    setApiMessage('Company name is required.', true);
    return;
  }

  submitBtn.disabled = true;
  setApiMessage('', false);

  try {
    await api.post('/onboarding', payload);

    // Reflect completed state in localStorage so dashboard guards pass
    const stored = getCurrentUser();
    if (stored) {
      stored.onboarding_completed = true;
      localStorage.setItem('user', JSON.stringify(stored));
    }

    setApiMessage('Profile saved! Redirecting…', false);
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1000);
  } catch (err) {
    setApiMessage(err.message || 'Something went wrong. Please try again.', true);
    submitBtn.disabled = false;
  }
});
