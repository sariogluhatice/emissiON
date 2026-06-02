import { ApiClient } from './apiClient.js';

const api = new ApiClient();

export const carbonProfileApi = {
    getCarbonProfile:        ()     => api.get('/carbon-profile'),
    updateCarbonProfile:     (data) => api.put('/carbon-profile', data),
    getIndividualComparison: ()     => api.get('/individual-comparison'),
};
