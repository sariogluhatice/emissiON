import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const gamificationApi = {
    async getStats()      { return client.get('/gamification/stats'); },
    async processEntry()  { return client.post('/gamification/process-entry', {}); },
};
