import { emissionService } from './api/emissionService.js';
import { TokenManager } from './api/tokenManager.js';
import { 
  getCurrentUser, 
  renderTopbarUser, 
  bindLogout, 
  showToast 
} from './utils/uiUtils.js';

// Setup
const user = getCurrentUser();
if (!user) {
  window.location.href = 'login.html';
}
renderTopbarUser(user);
bindLogout();

// Edit Detection
const params = new URLSearchParams(window.location.search);
const editId = params.get('id');
const isEdit = !!editId;

// DOM Elements
const form         = document.getElementById('addEmissionForm');
const submitBtn    = document.getElementById('submitBtn');
const categoryEl   = document.getElementById('category');
const amountEl     = document.getElementById('amount');
const dateEl       = document.getElementById('date');
const pageTitle    = document.getElementById('pageTitle');
const pageDesc     = document.getElementById('pageDesc');

if (isEdit) {
    if (pageTitle) pageTitle.textContent = 'Edit Emission Entry';
    if (pageDesc)  pageDesc.textContent  = 'Modify your existing activity record below.';
    if (submitBtn) submitBtn.textContent = 'Update Record';
}

const climatiqBox  = document.getElementById('climatiqBox');
const standardBlock = document.getElementById('standardBlock');
const flightBlock   = document.getElementById('flightBlock');

const activityEl   = document.getElementById('activity');
const quantityEl   = document.getElementById('quantity');
const unitLabel    = document.getElementById('unitLabel');
const calcStatus   = document.getElementById('calcStatus');

// Flight specific inputs
const originEl     = document.getElementById('origin');
const destEl       = document.getElementById('destination');

// Climatiq Activity Mapping
const ACTIVITY_MAP = {
  Energy: [
    { id: 'electricity-supply_grid-source_supplier_mix', label: 'Electricity (Grid Mix)', unit: 'kWh' },
    { id: 'fuel-type_gaseous_fuels_net-fuel_use_na', label: 'Natural Gas', unit: 'kWh' }
  ],
  Transport: [
    { id: 'passenger_vehicle-vehicle_type_car-fuel_source_petrol-engine_size_na-vehicle_age_na-vehicle_weight_na', label: 'Petrol Car', unit: 'km' },
    { id: 'passenger_vehicle-vehicle_type_car-fuel_source_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na', label: 'Diesel Car', unit: 'km' }
  ],
  Flight: [
    { id: 'transport_flight-passenger_flight-type_domestic-distance_na', label: 'Domestic Flight (KM)', unit: 'km' },
    { id: 'transport_flight-passenger_flight-type_short_haul-distance_na', label: 'Short Haul (KM)', unit: 'km' },
    { id: 'transport_flight-passenger_flight-type_long_haul-distance_na', label: 'Long Haul (KM)', unit: 'km' }
  ],
  Other: [
    { id: 'general_retail-type_nonstore_retailers', label: 'Shopping / General Retail', unit: 'usd' },
    { id: 'waste_management-type_solid_waste_disposal-disposal_method_managed_waste_disposal_sites', label: 'General Waste', unit: 'kg' },
    { id: 'paper_and_cardboard-type_paper_average_source', label: 'Paper Consumption', unit: 'kg' },
    { id: 'water_supply-type_na', label: 'Water Usage', unit: 'l' }
  ]
};

// Category Change -> ADAPTIVE UI SWITCH
categoryEl.addEventListener('change', () => {
  const cat = categoryEl.value;
  
  // Reset
  amountEl.value = '';
  amountEl.classList.remove('calculated');
  calcStatus.className = 'calc-status';
  calcStatus.textContent = '';

  if (ACTIVITY_MAP[cat]) {
    climatiqBox.style.display = 'block';
    
    if (cat === 'Flight') {
      standardBlock.style.display = 'none';
      flightBlock.style.display = 'block';
    } else {
      standardBlock.style.display = 'block';
      flightBlock.style.display = 'none';
    }
    
    // Populate activities
    const activities = ACTIVITY_MAP[cat];
    activityEl.innerHTML = '<option value="">Select an activity…</option>';
    activities.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.label;
      opt.dataset.unit = acc.unit;
      activityEl.appendChild(opt);
    });

    // Default to first activity and its unit
    if (activities.length > 0) {
      activityEl.selectedIndex = 1;
      unitLabel.textContent = activities[0].unit;
    }
  } else {
    climatiqBox.style.display = 'none';
  }
});

// Activity Change -> Update Unit and trigger calc
activityEl.addEventListener('change', () => {
  const selected = activityEl.options[activityEl.selectedIndex];
  if (selected && selected.dataset.unit) {
    unitLabel.textContent = selected.dataset.unit;
  }
  triggerCalculation();
});

// Auto Calculation Trigger
const triggerCalculation = async () => {
  const cat = categoryEl.value;
  let payload = {};

  try {
    if (cat === 'Flight') {
      const from = originEl.value.trim().toUpperCase();
      const to = destEl.value.trim().toUpperCase();
      if (from.length < 3 || to.length < 3) {
        calcStatus.className = 'calc-status';
        calcStatus.textContent = 'Awaiting route (e.g. IST to LHR)...';
        return;
      }
      payload = { from, to };
    } else {
      const activityId = activityEl.value;
      const quantity = parseFloat(quantityEl.value);
      const unit = unitLabel.textContent;
      
      if (!activityId || isNaN(quantity) || quantity <= 0) {
        amountEl.value = '';
        amountEl.classList.remove('calculated');
        return;
      }
      payload = { activityId, quantity, unit };
    }

    calcStatus.className = 'calc-status loading';
    calcStatus.textContent = 'Calculating carbon footprint...';
    amountEl.classList.remove('calculated');

    const response = await fetch('/api/emissions/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TokenManager.get() || ''}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
        console.error('Server error response:', result);
        throw new Error(result.message || `Server Error (${response.status})`);
    }

    amountEl.value = result.co2e.toFixed(2);
    amountEl.classList.add('calculated');
    
    // Success: Clear the status message to avoid redundancy (Delete the green)
    calcStatus.className = 'calc-status';
    calcStatus.textContent = '';
    
  } catch (err) {
    console.error('Calculation flow error:', err);
    calcStatus.className = 'calc-status error';
    
    // User-friendly fallback message
    let friendlyMsg = `⚠ ${err.message}`;
    if (err.message.includes('No emission factors')) {
      friendlyMsg = '⚠ Selected activity is not supported for this region yet.';
    } else if (err.message.includes('Failed to fetch')) {
      friendlyMsg = '⚠ Connection error. Please check your internet.';
    }
    
    calcStatus.textContent = friendlyMsg;
    amountEl.value = '';
    amountEl.classList.remove('calculated');
  }
};

/** Debounce utility to prevent too many API calls while typing */
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), ms);
  };
}

const debouncedCalc = debounce(triggerCalculation, 600);

// Unified Listeners
quantityEl.addEventListener('input', debouncedCalc);
originEl.addEventListener('input', debouncedCalc);
destEl.addEventListener('input', debouncedCalc);

// Validation
function validate() {
  let ok = true;
  ['category','amount','date'].forEach(id => {
    const err = document.getElementById(`${id}Error`);
    if (err) err.textContent = '';
  });

  if (!categoryEl.value) {
    document.getElementById('categoryError').textContent = 'Please select a category.';
    ok = false;
  }
  const amt = parseFloat(amountEl.value);
  if (!amountEl.value || isNaN(amt) || amt <= 0) {
    document.getElementById('amountError').textContent = 'Please enter or calculate an amount.';
    ok = false;
  }
  if (!dateEl.value) {
    document.getElementById('dateError').textContent = 'Please select a date.';
    ok = false;
  }
  return ok;
}

// Pre-fill Logic for Edit Mode
if (isEdit) {
    (async () => {
        try {
            const { records } = await emissionService.getAll();
            const record = records.find(r => String(r.id) === editId);
            
            if (record) {
                // Populate basic fields
                amountEl.value = parseFloat(record.amount).toFixed(2);
                dateEl.value = record.date.slice(0, 10);
                
                // Try to guess category from source
                const source = record.source.toLowerCase();
                let category = 'Other';
                
                if (source.includes('electricity') || source.includes('gas')) category = 'Energy';
                else if (source.includes('car')) category = 'Transport';
                else if (source.includes('flight')) category = 'Flight';
                
                categoryEl.value = category;
                categoryEl.dispatchEvent(new Event('change'));
                
                // If it's a specific activity, try to select it
                const activities = ACTIVITY_MAP[category];
                if (activities) {
                    const match = activities.find(a => source.includes(a.label.toLowerCase()) || a.label.toLowerCase().includes(source));
                    if (match) {
                        activityEl.value = match.id;
                        activityEl.dispatchEvent(new Event('change'));
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load record for edit:', err);
            showToast('Error', 'Failed to load record details.', 'error');
        }
    })();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? 'Updating...' : 'Saving...';

  try {
    // Determine a descriptive "source" for the record
    let source = categoryEl.value; 
    const fromInput = originEl.value.trim();
    const toInput   = destEl.value.trim();

    if (fromInput && toInput) {
      source = `Flight: ${fromInput.toUpperCase()}-${toInput.toUpperCase()}`;
    } else {
      const catList = ACTIVITY_MAP[categoryEl.value];
      if (catList) {
        const item = catList.find(i => i.id === activityEl.value);
        if (item) source = item.label;
      }
    }

    // Bug Fix: If source is still just "Food" or "Shopping" or generic category, 
    // it's better than empty, but let's ensure it's valid.
    if (!source || source === "") {
        source = categoryEl.value || "Other Activity";
    }

    const payload = {
      source: source,
      amount: parseFloat(amountEl.value),
      date:   dateEl.value,
    };

    if (isEdit) {
        await emissionService.update(editId, payload);
        showToast('Updated!', 'Record updated successfully.', 'success');
    } else {
        await emissionService.create(payload);
        showToast('Success!', 'Emission record created successfully.', 'success');
    }
    
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
  } catch (err) {
    showToast('Error!', err.message || 'Failed to save record.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = isEdit ? 'Update Record' : 'Save Entry';
  }
});
