const pool = require('../config/db');
const climatiqService = require('../services/climatiqService');

// --- CALCULATE ---
// POST /api/emissions/calculate
// Body: { activityId, quantity, unit } OR { from, to, flightClass }
const calculate = async (req, res) => {
    const { activityId, quantity, unit, from, to, flightClass } = req.body;

    try {
        let result;
        // If 'from' and 'to' are provided, assume it's a flight route calculation
        if (from && to) {
            result = await climatiqService.calculateFlightEmission(from, to, flightClass);
        } else {
            if (!activityId || !quantity || !unit) {
                return res.status(400).json({ message: 'activityId, quantity and unit are required for generic calculation.' });
            }
            result = await climatiqService.calculateEmission(activityId, quantity, unit);
        }
        
        return res.status(200).json(result);
    } catch (err) {
        console.error('[emissions.calculate]', err.message);
        return res.status(500).json({ message: err.message || 'Climatiq calculation failed.' });
    }
};

// --- GET ALL ---
// GET /api/emissions
// Returns all emission records for the logged-in user, newest first.
const getAll = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, source, amount, date, created_at
             FROM emission_records
             WHERE user_id = $1
             ORDER BY date DESC`,
            [req.user.id]
        );
        return res.status(200).json({ records: result.rows });
    } catch (err) {
        console.error('[emissions.getAll]', err.message);
        return res.status(500).json({ message: 'Server error.' });
    }
};

// --- CREATE ---
// POST /api/emissions
// Body: { source, amount, date }
const create = async (req, res) => {
    const { source: rawSource, amount, date } = req.body;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';

    if (!source || amount === undefined || !date) {
        return res.status(400).json({ message: 'source, amount and date are required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO emission_records (user_id, source, amount, date)
             VALUES ($1, $2, $3, $4)
             RETURNING id, source, amount, date, created_at`,
            [req.user.id, source, parsedAmount, date]
        );
        return res.status(201).json({
            message: 'Record created.',
            record: result.rows[0],
        });
    } catch (err) {
        console.error('[emissions.create]', err.message);
        return res.status(500).json({ message: 'Server error.' });
    }
};

// --- UPDATE ---
// PUT /api/emissions/:id
const update = async (req, res) => {
    const { id } = req.params;
    const { source: rawSource, amount, date } = req.body;
    const source = typeof rawSource === 'string' ? rawSource.trim() : '';

    if (!source || amount === undefined || !date) {
        return res.status(400).json({ message: 'source, amount and date are required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number.' });
    }

    try {
        const result = await pool.query(
            `UPDATE emission_records
             SET source = $1, amount = $2, date = $3
             WHERE id = $4 AND user_id = $5
             RETURNING id, source, amount, date, created_at`,
            [source, parsedAmount, date, id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Record not found.' });
        }

        return res.status(200).json({
            message: 'Record updated.',
            record: result.rows[0],
        });
    } catch (err) {
        console.error('[emissions.update]', err.message);
        return res.status(500).json({ message: 'Server error.' });
    }
};

// --- DELETE ---
// DELETE /api/emissions/:id
const remove = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM emission_records
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Record not found.' });
        }

        return res.status(200).json({ message: 'Record deleted.' });
    } catch (err) {
        console.error('[emissions.remove]', err.message);
        return res.status(500).json({ message: 'Server error.' });
    }
};

module.exports = { getAll, create, update, remove, calculate };
