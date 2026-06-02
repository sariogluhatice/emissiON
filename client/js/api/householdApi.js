import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const householdApi = {
    // ── Household lifecycle ──────────────────────────────────────────────────
    create:             (data)           => client.post('/households/create', data),
    join:               (data)           => client.post('/households/join', data),
    getMe:              ()               => client.get('/households/me'),

    // ── Dashboard & comparison ───────────────────────────────────────────────
    getDashboard:       ()               => client.get('/households/dashboard'),
    getComparison:      ()               => client.get('/households/comparison'),

    // ── Members (admin only) ─────────────────────────────────────────────────
    getMembers:         ()               => client.get('/households/members'),
    getMemberEmissions: (userId)         => client.get(`/households/members/${userId}/emissions`),

    // ── Tasks ────────────────────────────────────────────────────────────────
    createTask:         (data)           => client.post('/households/tasks', data),
    getTasks:           ()               => client.get('/households/tasks'),

    updateTaskStatus: (taskId, status)   => client.request(`/households/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    }),

    // ── Comments (admin only) ────────────────────────────────────────────────
    addComment:  (emissionId, comment)   => client.post(`/households/emissions/${emissionId}/comments`, { comment }),
    getComments: (emissionId)            => client.get(`/households/emissions/${emissionId}/comments`),
};
