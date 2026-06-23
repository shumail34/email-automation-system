const getBackendUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
  }
  return 'https://email-automation-system-4h0i.onrender.com';
};

export const BACKEND_URL = getBackendUrl();

