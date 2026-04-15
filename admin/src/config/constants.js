const rawBackendUrl = import.meta.env.VITE_BACKEND_URL || '';

export const backendUrl = rawBackendUrl.replace(/\/+$/, '');
export const currency = '$';
export const ADMIN_TOKEN_KEY = 'adminToken';
