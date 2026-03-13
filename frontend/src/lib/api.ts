const BASE_URL = "http://localhost:8081/api/v1";
const API_ORIGIN = new URL(BASE_URL).origin;

export const SWAGGER_URL = API_ORIGIN.includes(":4000")
  ? `${API_ORIGIN}/api/docs`
  : `${API_ORIGIN}/swagger-ui/index.html`;

export function getOAuthAuthorizeUrl(provider: "google" | "github") {
  if (API_ORIGIN.includes(":4000")) {
    return `${BASE_URL}/auth/oauth2/${provider}`;
  }
  return `${API_ORIGIN}/oauth2/authorize/${provider}`;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errors: Record<string, string> | null;
  timestamp: string;
}

export interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  role: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserInfo;
  // MFA challenge
  mfaRequired?: boolean;
  mfaTempToken?: string;
}

export interface MfaSetupData {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
}

export interface UserSession {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  current: boolean;
}

export interface LoginHistoryEntry {
  id: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  success: boolean;
  failureReason: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  isRead: boolean;
  readAt: string | null;
  data: string | null;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface FileUploadData {
  fileName: string;
  fileUrl: string;
  contentType: string;
  size: number;
}

export interface HealthStatus {
  status: "up" | "down";
  error?: string;
}

export interface HealthDetailed {
  status: "ok" | "error";
  timestamp: string;
  checks: {
    database: HealthStatus;
    redis: HealthStatus;
    minio: HealthStatus;
  };
}

function normalizeHealthDetailed(json: unknown): HealthDetailed {
  const root = (json ?? {}) as Record<string, unknown>;
  const payload =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const checksLike =
    (payload.checks as Record<string, unknown> | undefined) ??
    (payload.details as Record<string, unknown> | undefined) ??
    (payload.info as Record<string, unknown> | undefined) ??
    {};

  const normalizeStatus = (value: unknown): "up" | "down" => {
    const raw = String((value as { status?: unknown })?.status ?? "down").toLowerCase();
    return raw === "up" ? "up" : "down";
  };

  const normalizeCheck = (key: string): HealthStatus => {
    const item = (checksLike[key] ?? {}) as { status?: unknown; error?: unknown; message?: unknown };
    const error = item.error ?? item.message;
    return {
      status: normalizeStatus(item),
      ...(error ? { error: String(error) } : {}),
    };
  };

  return {
    status: String(payload.status ?? "error").toLowerCase() === "ok" ? "ok" : "error",
    timestamp: String(payload.timestamp ?? new Date().toISOString()),
    checks: {
      database: normalizeCheck("database"),
      redis: normalizeCheck("redis"),
      minio: normalizeCheck("minio"),
    },
  };
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("auth-storage");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.state?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  const json = await res.json();
  if (!res.ok) {
    throw json as ApiResponse<T>;
  }
  return json as ApiResponse<T>;
}

export const api = {
  register(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
  }) {
    return request<AuthData>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  login(data: { email: string; password: string; rememberMe?: boolean }) {
    return request<AuthData>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  refreshToken(refreshToken: string) {
    return request<AuthData>("/auth/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },

  logout(refreshToken: string) {
    return request<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  },

  logoutAll() {
    return request<void>("/auth/logout-all", {
      method: "POST",
    });
  },

  forgotPassword(email: string) {
    return request<void>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(data: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return request<void>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  changePassword(data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  verifyEmail(token: string) {
    return request<void>(`/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: "GET",
    });
  },

  resendVerification(email: string) {
    return request<void>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return request<FileUploadData>("/files/upload", {
      method: "POST",
      body: formData,
    });
  },

  uploadAvatar(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return request<FileUploadData>("/files/upload/avatar", {
      method: "POST",
      body: formData,
    });
  },

  // ── MFA ─────────────────────────────────────────────────────────────
  mfaSetup() {
    return request<MfaSetupData>("/auth/mfa/setup", { method: "POST" });
  },

  mfaVerify(code: string) {
    return request<void>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  mfaDisable(code: string) {
    return request<void>("/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  mfaValidate(mfaTempToken: string, code: string) {
    return request<AuthData>("/auth/mfa/validate", {
      method: "POST",
      body: JSON.stringify({ mfaTempToken, code }),
    });
  },

  // ── Sessions ─────────────────────────────────────────────────────────
  getSessions() {
    return request<UserSession[]>("/users/me/sessions", { method: "GET" });
  },

  deleteSession(sessionId: string) {
    return request<void>(`/users/me/sessions/${sessionId}`, { method: "DELETE" });
  },

  // ── Login History ────────────────────────────────────────────────────
  getLoginHistory(page = 0, size = 20) {
    return request<PageResponse<LoginHistoryEntry>>(
      `/users/me/login-history?page=${page}&size=${size}`,
      { method: "GET" }
    );
  },

  // ── Account ──────────────────────────────────────────────────────────
  deleteAccount() {
    return request<void>("/users/me", { method: "DELETE" });
  },

  // ── Profile ──────────────────────────────────────────────────────────
  getProfile() {
    return request<UserInfo>("/users/me", { method: "GET" });
  },

  updateProfile(data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
  }) {
    const sanitized = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== "" && value != null)
    ) as typeof data;

    return request<UserInfo>("/users/me", {
      method: "PUT",
      body: JSON.stringify(sanitized),
    });
  },

  // ── Notifications ─────────────────────────────────────────────────────
  getNotifications(page = 0, size = 20) {
    return request<PageResponse<NotificationItem>>(
      `/notifications?page=${page}&size=${size}`,
      { method: "GET" }
    );
  },

  getUnreadCount() {
    return request<{ count: number }>("/notifications/unread-count", { method: "GET" });
  },

  markNotificationRead(id: string) {
    return request<void>(`/notifications/${id}/read`, { method: "PATCH" });
  },

  markAllNotificationsRead() {
    return request<{ count: number }>("/notifications/read-all", { method: "PATCH" });
  },

  deleteNotification(id: string) {
    return request<void>(`/notifications/${id}`, { method: "DELETE" });
  },

  // ── Health ────────────────────────────────────────────────────────────
  healthBasic() {
    return request<{ status: string; timestamp: string }>("/health", { method: "GET" });
  },

  healthDetailed() {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(`${BASE_URL}/health/detailed`, { headers }).then(async (res) => {
      const json = await res.json();
      if (!res.ok) {
        throw json;
      }
      return normalizeHealthDetailed(json);
    });
  },
};
