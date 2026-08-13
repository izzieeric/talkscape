import { getActivePinia } from 'pinia';

export function clearClientCache() {
  try {
    uni.clearStorageSync();
  } catch {}

  try {
    const activePinia = getActivePinia();
    if (activePinia?._s instanceof Map) {
      activePinia._s.forEach((store) => {
        if (store && typeof store.$reset === 'function') {
          store.$reset();
        }
      });
    }
  } catch {}
}

export default {
  clearClientCache
};
