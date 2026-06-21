import axios, { AxiosRequestConfig } from 'axios';

/**
 * Create axios instance with defaults
 */
const apiClient = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Important for Better Auth cookies
});

// Request interceptor
apiClient.interceptors.request.use(
    (config) => config,
    (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const data = error.response?.data;
        
        // Extract message from multiple possible formats
        let message = 'Something went wrong';
        let details = data?.details;

        if (data) {
            // New standardized format: { error: { message, name, details } }
            if (typeof data.error === 'object' && data.error !== null) {
                message = data.error.message || message;
                details = data.error.details || details;
            }
            // Legacy/Standard formats: { message: "msg" } or { error: "msg" }
            else {
                message = data.message || data.error || message;
            }
        } else if (error.message) {
            message = error.message;
        }

        // Surface validation field detail di message supaya error 400 (Zod
        // ValidationError) tidak generik "Invalid request data" — operator
        // langsung lihat field mana yang gagal.
        if (Array.isArray(details) && details.length > 0) {
            const fieldErrors = details
                .map((d) => (d?.path ? `${d.path}: ${d.message}` : d?.message))
                .filter(Boolean)
                .join('; ');
            if (fieldErrors) message = `${message} — ${fieldErrors}`;
        }

        const apiError = {
            message,
            status: error.response?.status,
            code: error.code,
            details
        };
        
        // Handle 401 unauthorized - redirect to login
        if (error.response?.status === 401) {
            if (!window.location.pathname.startsWith('/login')) {
                window.location.href = '/login';
            }
        }

        console.error('API Error:', apiError.message);
        return Promise.reject(apiError);
    }
);

/**
 * Helper function for GET requests
 */
export const get = async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.get(url, config);
    return response.data.data;
};

/**
 * Helper function for POST requests
 */
export const post = async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.post(url, data, config);
    return response.data.data;
};

/**
 * Helper function for PUT requests
 */
export const put = async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.put(url, data, config);
    return response.data.data;
};

/**
 * Helper function for DELETE requests
 */
export const del = async <T = void>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.delete(url, config);
    return response.data?.data;
};

/**
 * Helper function for PATCH requests
 */
export const patch = async <T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiClient.patch(url, data, config);
    return response.data.data;
};

export { apiClient };
export default apiClient;
