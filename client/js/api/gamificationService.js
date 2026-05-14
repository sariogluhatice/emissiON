import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const gamificationService = {
    async getStats()      { return client.get('/gamification/stats'); },
    async processEntry()  { return client.post('/gamification/process-entry', {}); },
};
