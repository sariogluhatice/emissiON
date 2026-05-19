import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const companyService = {
    // ── Company profile ──────────────────────────────────────────────────────
    getProfile:   ()     => client.get('/company/profile'),
    upsertProfile: (data) => client.put('/company/profile', data),

    // ── CBAM summary + entries ───────────────────────────────────────────────
    getCbamSummary:       ()         => client.get('/company/cbam/summary'),
    getCbamDefaultFactor: (category) => client.get(`/company/cbam/default-factor?category=${encodeURIComponent(category)}`),
    getPeriodEmissions:   (period)   => client.get(`/company/cbam/period-emissions?period=${period}`),

    getEntries:  ({ page = 1, limit = 20 } = {}) =>
        client.get(`/company/cbam/entries?page=${page}&limit=${limit}`),

    createEntry: (data) => client.post('/company/cbam/entries', data),

    updateEntry: (id, data) => client.request(`/company/cbam/entries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),

    deleteEntry: (id) => client.delete(`/company/cbam/entries/${id}`),

    // ── Dashboard ────────────────────────────────────────────────────────────
    getDashboard: () => client.get('/company/dashboard'),

    // ── Company tasks ────────────────────────────────────────────────────────
    getTasks:         ()           => client.get('/company/tasks'),
    createTask:       (data)       => client.post('/company/tasks', data),
    updateTaskStatus: (id, status) => client.request(`/company/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    }),

    // ── What-if simulation ───────────────────────────────────────────────────
    runSimulation: (data) => client.post('/company/simulate', data),

    getSavedSimulations: ({ page = 1, limit = 20 } = {}) =>
        client.get(`/company/simulate/saved?page=${page}&limit=${limit}`),

    // ── Company reports ──────────────────────────────────────────────────────
    generateReport: (data) => client.post('/company/reports', data),

    getMyReports: () => client.get('/company/reports'),

    // ── Report sharing ───────────────────────────────────────────────────────
    requestReportAccess: (report_no) =>
        client.post('/company/reports/request-access', { report_no }),

    getIncomingAccessRequests: () =>
        client.get('/company/reports/access-requests/incoming'),

    getOutgoingAccessRequests: () =>
        client.get('/company/reports/access-requests/outgoing'),

    getPendingIncomingCount: () =>
        client.get('/company/reports/access-requests/pending-count'),

    respondToAccessRequest: (id, decision) =>
        client.request(`/company/reports/access-requests/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ decision }),
        }),

    revokeReportAccess: (id) =>
        client.request(`/company/reports/access-requests/${id}`, { method: 'DELETE' }),

    getSharedReport: (reportId) =>
        client.get(`/company/reports/${reportId}/shared`),
};
