require('dotenv').config();
const climatiqService = require('./src/services/climatiqService');

async function testCalculations() {
    console.log('--- EMISSION CALCULATION TEST START ---');
    
    const tests = [
        { name: 'Water Usage (100L)', id: 'water_supply-type_na', q: 100, u: 'l' },
        { name: 'Paper Consumption (5kg)', id: 'paper_and_cardboard-type_paper_average_source', q: 5, u: 'kg' },
        { name: 'Natural Gas (200kWh)', id: 'fuel-type_gaseous_fuels_net-fuel_use_na', q: 200, u: 'kWh' },
        { name: 'Petrol Car (10km)', id: 'passenger_vehicle-vehicle_type_car-fuel_source_petrol-engine_size_na-vehicle_age_na-vehicle_weight_na', q: 10, u: 'km' },
        { name: 'Flight (IST - LHR)', route: { from: 'IST', to: 'LHR' } },
        { name: 'Flight (Istanbul - London)', route: { from: 'Istanbul', to: 'London Heathrow' } },
        { name: 'Waste (50kg)', id: 'waste_management-type_solid_waste_disposal-disposal_method_managed_waste_disposal_sites', q: 50, u: 'kg' }
    ];

    for (const t of tests) {
        try {
            console.log(`\nTesting: ${t.name}...`);
            let res;
            if (t.route) {
                res = await climatiqService.calculateFlightEmission(t.route.from, t.route.to);
            } else {
                res = await climatiqService.calculateEmission(t.id, t.q, t.u);
            }
            console.log(`✅ Success: ${res.co2e} ${res.unit}`);
        } catch (err) {
            console.log(`❌ FAILED: ${t.name}`);
            console.log(`   Error: ${err.message}`);
        }
    }

    console.log('\n--- TEST COMPLETE ---');
}

testCalculations();
