const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://email-automation-system-4h0i.onrender.com/api';

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('outreachpro_access') : null;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }

  try {
    let response = await fetch(`${API_URL}${endpoint}`, {
      cache: 'no-store', // Prevent Next.js from caching API responses globally
      ...options,
      headers,
    });

    if (response.status === 401 && token) {
      // Token might be expired, try to refresh
      const refresh = sessionStorage.getItem('outreachpro_refresh');
      if (refresh) {
        const refreshRes = await fetch(`${API_URL}/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          sessionStorage.setItem('outreachpro_access', data.access);
          
          // Retry original request
          (headers as any)['Authorization'] = `Bearer ${data.access}`;
          response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
          });
        } else {
          // Refresh failed, log out
          sessionStorage.removeItem('outreachpro_access');
          sessionStorage.removeItem('outreachpro_refresh');
          sessionStorage.removeItem('outreachpro_session');
          window.location.href = '/auth';
        }
      } else {
        window.location.href = '/auth';
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let msg = errorData.detail || errorData.message;
      if (!msg && typeof errorData === 'object') {
        // Handle field-specific errors: {"email": ["..."], "username": ["..."]}
        msg = Object.entries(errorData)
          .map(([key, val]) => `${key}: ${Array.isArray(val) ? val.join(', ') : val}`)
          .join(' | ');
      }
      throw new Error(msg || 'API request failed');
    }

    if (response.status === 204) {
      return null;
    }
    
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
};
