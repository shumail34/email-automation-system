"use client";

if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    if (args[0] && typeof args[0] === 'string' && (
      args[0].includes('A tree hydrated but some attributes of the server rendered HTML') ||
      args[0].includes('Hydration failed because the initial UI does not match') ||
      args[0].includes('There was an error while hydrating') ||
      args[0].includes('Warning: Expected server HTML to contain a matching')
    )) {
      return;
    }
    originalError.call(console, ...args);
  };
}

export default function HydrationHelper() {
  return null;
}
