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
        const apiError = {
            message: error.response?.data?.message || error.message || 'Something went wrong',
            status: error.response?.status,
            code: error.code,
        };

        // Handle 401 unauthorized - redirect to login
        if (error.response?.status === 401) {
            if (!window.location.pathname.startsWith('/login') &&
                !window.location.pathname.startsWith('/signup')) {
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

export { apiClient };
export default apiClient;
