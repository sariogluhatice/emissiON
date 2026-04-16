/**
 * Service to interface with Climatiq API.
 * Uses native fetch available in Node 18+
 */
class ClimatiqService {
    constructor() {
        this.apiKey = process.env.CLIMATIQ_API_KEY;
    }

    /** Generic estimation */
    async calculateEmission(activityId, quantity, unit) {
        const url = 'https://api.climatiq.io/data/v1/estimate';
        const payload = {
            emission_factor: {
                activity_id: activityId,
                data_version: "^21"
            },
            parameters: {
                [this.getParameterKey(unit)]: parseFloat(quantity),
                [`${this.getParameterKey(unit)}_unit`]: unit
            },
            region_fallback: true
        };
        return this._post(url, payload);
    }

    /** Specialized estimation for Flights (Local Distance Bypass) */
    async calculateFlightEmission(from, to, flightClass = 'economy') {
        const airports = require('../data/airports.json');
        const { calculateDistance } = require('../utils/geoUtils');

        const findAirport = (input) => {
            const code = input.trim().toUpperCase();
            if (airports[code]) return airports[code];
            
            // Search by name if code not found
            const entry = Object.values(airports).find(a => 
                a.name.toLowerCase().includes(input.toLowerCase())
            );
            return entry;
        };

        const start = findAirport(from);
        const end   = findAirport(to);

        if (!start || !end) {
            throw new Error(`Airport not found for "${!start ? from : to}". Please use codes (e.g. IST) or common names.`);
        }

        const distance = calculateDistance(start.lat, start.lon, end.lat, end.lon);
        
        // Determine Haul Type based on verified BEIS IDs
        let activityId = 'passenger_flight-route_type_international-aircraft_type_na-distance_short_haul_lt_3700km-class_na-rf_included-distance_uplift_included';
        if (distance < 1000) {
            activityId = 'passenger_flight-route_type_domestic-aircraft_type_na-distance_na-class_na-rf_included-distance_uplift_included';
        } else if (distance > 3700) {
            activityId = 'passenger_flight-route_type_international-aircraft_type_na-distance_long_haul_gt_3700km-class_na-rf_included-distance_uplift_included';
        }

        return this.calculateEmission(activityId, distance, 'km');
    }

    /** Private helper for API requests */
    async _post(url, payload) {
        if (!this.apiKey) throw new Error('CLIMATIQ_API_KEY is missing.');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Climatiq API error');
        }

        return {
            co2e: data.co2e || data.results?.[0]?.co2e,
            unit: data.co2e_unit || data.results?.[0]?.co2e_unit,
            distance: data.results?.[0]?.distance
        };
    }

    getParameterKey(unit) {
        const map = { 
            'kWh': 'energy', 
            'km': 'distance', 
            'l': 'volume', 
            'kg': 'weight', 
            'piece': 'number' 
        };
        return map[unit] || 'money';
    }
}

module.exports = new ClimatiqService();
