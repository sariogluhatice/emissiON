import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const emissionService = {
    getAll:         ()         => client.get('/emissions'),
    create:         (data)     => client.post('/emissions', data),
    update:         (id, data) => client.put(`/emissions/${id}`, data),
    remove:         (id)       => client.delete(`/emissions/${id}`),
};
