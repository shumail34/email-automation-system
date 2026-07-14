import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { BACKEND_URL } from './backend';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000; // 10 seconds

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 15000, // Initial timeout of 15s
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('outreachpro_access');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor for automatic retry and token refresh
apiClient.interceptors.response.use(
  (response) => {
    // If we had a successful response, we might want to clear any loading states
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cold-start-resolved'));
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as any;
    if (!config) return Promise.reject(error);

    // 1. Token Refresh Logic
    if (error.response?.status === 401 && !config._retryAuth) {
      config._retryAuth = true;
      if (typeof window !== 'undefined') {
        const refresh = sessionStorage.getItem('outreachpro_refresh');
        if (refresh) {
          try {
            const refreshRes = await axios.post(`${BACKEND_URL}/api/token/refresh/`, { refresh });
            if (refreshRes.status === 200) {
              const { access } = refreshRes.data;
              sessionStorage.setItem('outreachpro_access', access);
              config.headers['Authorization'] = `Bearer ${access}`;
              return apiClient(config);
            }
          } catch (refreshErr) {
            sessionStorage.removeItem('outreachpro_access');
            sessionStorage.removeItem('outreachpro_refresh');
            sessionStorage.removeItem('outreachpro_session');
            window.location.href = '/auth';
            return Promise.reject(refreshErr);
          }
        } else {
           window.location.href = '/auth';
        }
      }
    }

    // 2. Cold Start / Retry Logic
    // Detect cold start: Network error, timeout, 502, 503, 504
    const isColdStartError = 
      error.code === 'ECONNABORTED' || 
      error.message === 'Network Error' ||
      !error.response ||
      (error.response && [502, 503, 504].includes(error.response.status));

    // Do NOT retry for 400, 401, 403, 404, etc.
    const isClientError = error.response && error.response.status >= 400 && error.response.status < 500;

    if (isColdStartError && !isClientError) {
      config._retryCount = config._retryCount || 0;
      
      if (config._retryCount < MAX_RETRIES) {
        config._retryCount++;
        
        // Dispatch event so UI can show the loader if desired
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cold-start-detected', { 
            detail: { retryCount: config._retryCount, maxRetries: MAX_RETRIES } 
          }));
        }

        console.log(`[Cold Start Detected] Retrying request (${config._retryCount}/${MAX_RETRIES}) in ${RETRY_DELAY_MS}ms...`);
        
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(apiClient(config));
          }, RETRY_DELAY_MS);
        });
      } else {
        // Max retries reached
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('cold-start-failed'));
        }
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Pings the health endpoint to check if backend is awake.
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const res = await axios.get(`${BACKEND_URL}/api/health/`, { timeout: 8000 });
    return res.status === 200;
  } catch (error) {
    return false;
  }
};
