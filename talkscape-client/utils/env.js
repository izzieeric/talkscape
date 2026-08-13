// 生产地址通过 VITE_API_BASE_URL 注入，避免在源码中绑定维护者的部署地址。
const ENV_API_BASE_URL = typeof import.meta !== 'undefined'
  ? import.meta.env?.VITE_API_BASE_URL
  : '';
export const API_BASE_URL = ENV_API_BASE_URL || 'http://localhost:3000/talkscape';

// 页面路径
export const LOGIN_PAGE = '/pages/auth/login';
export const HOME_PAGE = '/pages/index/index';

export function getApiBaseUrl() {
  return API_BASE_URL.replace(/\/+$/, '');
}
