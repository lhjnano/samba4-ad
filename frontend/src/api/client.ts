import axios from "axios";

const TOKEN_KEY = "ad_manager_token";

export const api = axios.create({
  baseURL: "",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// Request interceptor — attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — normalize error shape, handle 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;

      // Auto-logout on 401 (unless it's the login endpoint)
      if (status === 401 && !error.config?.url?.includes("/auth/login")) {
        localStorage.removeItem(TOKEN_KEY);
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }

      const detail = data?.detail || data?.message || "Request failed";
      return Promise.reject({ status, message: detail, raw: data });
    }
    if (error.request) {
      return Promise.reject({ status: 0, message: "Network error — cannot reach server" });
    }
    return Promise.reject({ status: -1, message: error.message || "Unknown error" });
  }
);
