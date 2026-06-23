const getBackendUrl = () => {
  if (process.env.DJANGO_API_URL) {
    return process.env.DJANGO_API_URL;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '');
  }
  return 'https://email-automation-system-4h0i.onrender.com';
};

export const BACKEND_URL = getBackendUrl();
