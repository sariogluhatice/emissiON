import { ApiClient } from './apiClient.js';

const api = new ApiClient();

export const profileService = {
    getProfile:            ()     => api.get('/profile'),
    updateProfile:         (data) => api.put('/profile', data),
    deleteAccount:         (data) => api.delete('/profile', data),
    requestEmailChange:    (data) => api.post('/profile/email-change/request', data),
    verifyEmailChange:     (data) => api.post('/profile/email-change/verify', data),
    requestPasswordChange: (data) => api.post('/profile/password-change/request', data),
    verifyPasswordChange:  (data) => api.post('/profile/password-change/verify', data),
    getSettings:           ()     => api.get('/settings'),
    updateSettings:        (data) => api.put('/settings', data),
    getCarbonProfile:         ()     => api.get('/carbon-profile'),
    updateCarbonProfile:      (data) => api.put('/carbon-profile', data),
    getIndividualComparison:  ()     => api.get('/individual-comparison'),
    simulateWhatIf:           (data) => api.post('/what-if-simulation', data),
};
