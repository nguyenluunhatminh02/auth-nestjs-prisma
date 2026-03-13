"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useToastStore } from "@/lib/toast-store";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordValues, updateProfileSchema, type UpdateProfileValues } from "@/lib/schemas";
import {
  api,
  type FileUploadData,
  type ApiResponse,
  type MfaSetupData,
  type UserSession,
  type LoginHistoryEntry,
  type NotificationItem,
  type HealthDetailed,
  SWAGGER_URL,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  AlertCircle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Database,
  Edit,
  ExternalLink,
  FileUp,
  History,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Monitor,
  RefreshCw,
  Save,
  Server,
  Shield,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value || "\u2014"}</span>
    </div>
  );
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN_SUCCESS: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  LOGIN_FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  LOGOUT: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  LOGOUT_ALL: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  LOGOUT_SESSION: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MFA_ENABLED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  MFA_DISABLED: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  PASSWORD_CHANGED: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ACCOUNT_DELETED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout, logoutAll, refreshUser, accessToken, setAuthData, setUser } =
    useAuthStore();
  const { showToast } = useToastStore();

  // File states
  const [uploadedFiles, setUploadedFiles] = useState<FileUploadData[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Header states
  const [refreshing, setRefreshing] = useState(false);
  const [resending, setResending] = useState(false);

  // MFA states
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupData | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState<"idle" | "setup" | "verify" | "disable">("idle");

  // Session states
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  // Login history states
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

  // Edit profile
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  // Avatar
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPage, setNotifPage] = useState(0);
  const [notifHasMore, setNotifHasMore] = useState(false);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [deletingNotif, setDeletingNotif] = useState<string | null>(null);
  // Health
  const [healthData, setHealthData] = useState<HealthDetailed | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Delete account
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const changePasswordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const profileForm = useForm<UpdateProfileValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      phone: user?.phone ?? "",
      dateOfBirth: user?.dateOfBirth ?? "",
      gender: user?.gender ?? "",
    },
  });

  /* ─────────────── Header handlers ─────────────── */
  const handleRefreshToken = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
      showToast("Token refreshed!", "success");
    } catch {
      showToast("Failed to refresh token", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast("Logged out successfully", "info");
    router.replace("/login");
  };

  const handleLogoutAll = async () => {
    await logoutAll();
    showToast("Logged out from all devices", "info");
    router.replace("/login");
  };

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await api.resendVerification(user!.email);
      showToast("Verification email sent!", "success");
    } catch {
      showToast("Failed to resend verification", "error");
    } finally {
      setResending(false);
    }
  };

  const handleChangePassword = async (values: ChangePasswordValues) => {
    try {
      await api.changePassword(values);
      showToast("Password changed successfully!", "success");
      changePasswordForm.reset();
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      changePasswordForm.setError("root", { message: apiErr.message || "Failed to change password" });
    }
  };

  /* ─────────────── File upload ─────────────── */
  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const res = await api.uploadFile(file);
        if (res.data) {
          setUploadedFiles((prev) => [...prev, res.data!]);
          showToast("File uploaded successfully!", "success");
        }
      } catch (err) {
        const apiErr = err as ApiResponse<unknown>;
        showToast(apiErr.message || "Upload failed", "error");
      } finally {
        setUploading(false);
      }
    },
    [showToast]
  );

  /* ─────────────── MFA handlers ─────────────── */
  const handleMfaSetup = async () => {
    setMfaLoading(true);
    try {
      const res = await api.mfaSetup();
      setMfaSetupData(res.data!);
      setMfaStep("verify");
      setMfaCode("");
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      showToast(apiErr.message || "Failed to start MFA setup", "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);
    try {
      await api.mfaVerify(mfaCode);
      showToast("Two-factor authentication enabled!", "success");
      setMfaStep("idle");
      setMfaSetupData(null);
      setMfaCode("");
      await refreshUser();
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      showToast(apiErr.message || "Invalid code. Try again.", "error");
    } finally {
      setMfaLoading(false);
    }
  };

  const handleMfaDisable = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);
    try {
      await api.mfaDisable(mfaCode);
      showToast("Two-factor authentication disabled.", "success");
      setMfaStep("idle");
      setMfaCode("");
      await refreshUser();
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      showToast(apiErr.message || "Invalid code. Try again.", "error");
    } finally {
      setMfaLoading(false);
    }
  };

  /* ─────────────── Session handlers ─────────────── */
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await api.getSessions();
      setSessions(res.data ?? []);
    } catch {
      showToast("Failed to load sessions", "error");
    } finally {
      setSessionsLoading(false);
    }
  }, [showToast]);

  const handleDeleteSession = async (sessionId: string) => {
    setDeletingSession(sessionId);
    try {
      await api.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast("Session logged out", "success");
    } catch {
      showToast("Failed to logout session", "error");
    } finally {
      setDeletingSession(null);
    }
  };

  /* ─────────────── Login history ─────────────── */
  const loadLoginHistory = useCallback(
    async (page = 0, append = false) => {
      page === 0 ? setHistoryLoading(true) : setHistoryLoadingMore(true);
      try {
        const res = await api.getLoginHistory(page, 15);
        const data = res.data!;
        setLoginHistory((prev) => (append ? [...prev, ...data.content] : data.content));
        setHistoryPage(page);
        setHistoryHasMore(!data.last);
      } catch {
        showToast("Failed to load login history", "error");
      } finally {
        setHistoryLoading(false);
        setHistoryLoadingMore(false);
      }
    },
    [showToast]
  );

  /* ─────────────── Delete account ─────────────── */
  const handleDeleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeletingAccount(true);
    try {
      await api.deleteAccount();
      showToast("Account deleted.", "info");
      router.replace("/login");
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      showToast(apiErr.message || "Failed to delete account", "error");
      setDeletingAccount(false);
      setConfirmDelete(false);
    }
  };

  /* ───────────────── Edit profile ───────────────── */
  const handleUpdateProfile = async (values: UpdateProfileValues) => {
    setSavingProfile(true);
    try {
      const res = await api.updateProfile(values);
      if (res.data) setUser(res.data);
      showToast("Profile updated successfully!", "success");
      setEditingProfile(false);
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      profileForm.setError("root", { message: apiErr.message || "Failed to update profile" });
    } finally {
      setSavingProfile(false);
    }
  };

  /* ───────────────── Avatar upload ───────────────── */
  const handleAvatarUpload = useCallback(
    async (file: File) => {
      setUploadingAvatar(true);
      try {
        await api.uploadAvatar(file);
        await refreshUser();
        showToast("Avatar updated!", "success");
      } catch (err) {
        const apiErr = err as ApiResponse<unknown>;
        showToast(apiErr.message || "Avatar upload failed", "error");
      } finally {
        setUploadingAvatar(false);
      }
    },
    [showToast, refreshUser]
  );

  /* ───────────────── Notifications ───────────────── */
  const loadNotifications = useCallback(
    async (page = 0, append = false) => {
      page === 0 ? setNotifLoading(true) : setNotifLoadingMore(true);
      try {
        const notifRes = await api.getNotifications(page, 15);
        const data = notifRes.data!;
        setNotifications((prev) => (append ? [...prev, ...data.content] : data.content));
        setNotifPage(page);
        setNotifHasMore(!data.last);
        if (page === 0) {
          try {
            const countRes = await api.getUnreadCount();
            if (countRes.data?.count != null) setUnreadCount(countRes.data.count);
          } catch {
            // unread count non-critical
          }
        }
      } catch {
        showToast("Failed to load notifications", "error");
      } finally {
        setNotifLoading(false);
        setNotifLoadingMore(false);
      }
    },
    [showToast]
  );

  const handleMarkNotifRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      showToast("Failed to mark as read", "error");
    }
  };

  const handleMarkAllNotifRead = async () => {
    setMarkingAllRead(true);
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      showToast("All notifications marked as read", "success");
    } catch {
      showToast("Failed to mark all as read", "error");
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleDeleteNotif = async (id: string) => {
    setDeletingNotif(id);
    try {
      await api.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      showToast("Notification deleted", "success");
    } catch {
      showToast("Failed to delete notification", "error");
    } finally {
      setDeletingNotif(null);
    }
  };

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await api.healthDetailed();
      setHealthData(data);
    } catch {
      showToast("Failed to load health status", "error");
    } finally {
      setHealthLoading(false);
    }
  }, [showToast]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/20">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-full bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{user.fullName}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Badge variant="secondary" className="ml-1">
              {user.role.replace("ROLE_", "")}
            </Badge>
            {user.twoFactorEnabled && (
              <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-600">
                <ShieldCheck className="h-3 w-3" />
                2FA
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefreshToken} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline ml-1">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Logout</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLogoutAll}>
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Logout All</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Email not verified banner */}
        {!user.isEmailVerified && (
          <Alert variant="warning">
            <Mail className="h-4 w-4" />
            <AlertTitle>Email not verified</AlertTitle>
            <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
              <span>Please verify your email address to access all features.</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleResendVerification} disabled={resending}>
                  {resending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Resend Email
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href="http://localhost:8025" target="_blank" rel="noopener noreferrer">
                    Open Mailpit
                  </a>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="profile">
          <TabsList className="w-full overflow-x-auto sm:w-auto flex">
            <TabsTrigger value="profile" className="flex-shrink-0">
              <User className="h-4 w-4 mr-1.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="password" className="flex-shrink-0">
              <KeyRound className="h-4 w-4 mr-1.5" />
              Password
            </TabsTrigger>
            <TabsTrigger value="files" className="flex-shrink-0">
              <FileUp className="h-4 w-4 mr-1.5" />
              Files
            </TabsTrigger>
            <TabsTrigger value="security" className="flex-shrink-0">
              <Lock className="h-4 w-4 mr-1.5" />
              Security
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex-shrink-0" onClick={loadSessions}>
              <Monitor className="h-4 w-4 mr-1.5" />
              Sessions
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-shrink-0"
              onClick={() => loginHistory.length === 0 && loadLoginHistory(0)}
            >
              <History className="h-4 w-4 mr-1.5" />
              History
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="flex-shrink-0 relative"
              onClick={() => notifications.length === 0 && loadNotifications(0)}
            >
              <Bell className="h-4 w-4 mr-1.5" />
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-xs font-bold text-white bg-red-500 rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="health"
              className="flex-shrink-0"
              onClick={() => !healthData && loadHealth()}
            >
              <Activity className="h-4 w-4 mr-1.5" />
              Health
            </TabsTrigger>
          </TabsList>

          {/* ─── Profile Tab ─── */}
          <TabsContent value="profile">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Profile Information</CardTitle>
                  {!editingProfile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        profileForm.reset({
                          firstName: user.firstName,
                          lastName: user.lastName,
                          phone: user.phone ?? "",
                          dateOfBirth: user.dateOfBirth ?? "",
                          gender: user.gender ?? "",
                        });
                        setEditingProfile(true);
                      }}
                    >
                      <Edit className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <ProfileRow label="ID" value={<span className="font-mono text-xs">{user.id}</span>} />
                  <ProfileRow label="Email" value={user.email} />
                  <ProfileRow label="First Name" value={user.firstName} />
                  <ProfileRow label="Last Name" value={user.lastName} />
                  <ProfileRow label="Full Name" value={user.fullName} />
                  <ProfileRow label="Phone" value={user.phone} />
                  <ProfileRow label="Role" value={<Badge variant="secondary">{user.role}</Badge>} />
                  <ProfileRow
                    label="Email Verified"
                    value={
                      user.isEmailVerified ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Not Verified
                        </Badge>
                      )
                    }
                  />
                  <ProfileRow label="Active" value={user.isActive ? "Yes" : "No"} />
                  <ProfileRow
                    label="2FA"
                    value={
                      user.twoFactorEnabled ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Disabled
                        </Badge>
                      )
                    }
                  />
                  <ProfileRow label="Last Login" value={user.lastLoginAt} />
                  <ProfileRow label="Created" value={user.createdAt} />

                  {editingProfile && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <p className="text-sm font-medium">Edit Profile</p>
                      <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(handleUpdateProfile)} className="space-y-3">
                          {profileForm.formState.errors.root && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{profileForm.formState.errors.root.message}</AlertDescription>
                            </Alert>
                          )}
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={profileForm.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>First Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="John" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={profileForm.control}
                              name="lastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Last Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Doe" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={profileForm.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Phone</FormLabel>
                                <FormControl>
                                  <Input placeholder="+1234567890" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={profileForm.control}
                            name="dateOfBirth"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Date of Birth</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={profileForm.control}
                            name="gender"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Gender</FormLabel>
                                <FormControl>
                                  <select
                                    {...field}
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  >
                                    <option value="">Select gender</option>
                                    <option value="MALE">Male</option>
                                    <option value="FEMALE">Female</option>
                                    <option value="OTHER">Other</option>
                                  </select>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex gap-2 justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingProfile(false)}
                              disabled={savingProfile}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={savingProfile}>
                              {savingProfile ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5 mr-1" />
                              )}
                              Save Changes
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quick Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { label: "Mailpit", url: "http://localhost:8025" },
                      { label: "MinIO Console", url: "http://localhost:9001" },
                      { label: "Swagger API", url: SWAGGER_URL },
                    ].map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2 rounded-md hover:bg-secondary transition-colors text-sm"
                      >
                        {link.label}
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </a>
                    ))}
                  </CardContent>
                </Card>

                {/* Danger zone */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Avatar</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {user.avatarUrl && (
                      <div className="flex justify-center mb-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName}
                          className="w-20 h-20 rounded-full object-cover border"
                        />
                      </div>
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleAvatarUpload(file);
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      {uploadingAvatar ? "Uploading..." : "Upload Avatar"}
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {confirmDelete && (
                      <Alert variant="destructive" className="mb-3">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          This action is <strong>permanent</strong>. Click again to confirm.
                        </AlertDescription>
                      </Alert>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={handleDeleteAccount}
                      disabled={deletingAccount}
                    >
                      {deletingAccount ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      {confirmDelete ? "Confirm Delete Account" : "Delete Account"}
                    </Button>
                    {confirmDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ─── Password Tab ─── */}
          <TabsContent value="password">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="text-base">Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent>
                {changePasswordForm.formState.errors.root && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{changePasswordForm.formState.errors.root.message}</AlertDescription>
                  </Alert>
                )}
                <Form {...changePasswordForm}>
                  <form onSubmit={changePasswordForm.handleSubmit(handleChangePassword)} className="space-y-4">
                    <FormField
                      control={changePasswordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={changePasswordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={changePasswordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={changePasswordForm.formState.isSubmitting}>
                      {changePasswordForm.formState.isSubmitting && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Change Password
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Files Tab ─── */}
          <TabsContent value="files">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Upload File</CardTitle>
                  <CardDescription>Upload files to MinIO storage</CardDescription>
                </CardHeader>
                <CardContent>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    {uploading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    )}
                    <p className="text-sm font-medium">
                      {uploading ? "Uploading..." : "Click or drag & drop a file here"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Any file type supported</p>
                  </div>
                </CardContent>
              </Card>

              {uploadedFiles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Uploaded Files</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {uploadedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{file.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.contentType} {"\u00B7"} {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            View
                          </a>
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ─── Security / MFA Tab ─── */}
          <TabsContent value="security">
            <div className="space-y-4 max-w-lg">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Two-Factor Authentication
                  </CardTitle>
                  <CardDescription>
                    Add an extra layer of security to your account using an authenticator app (Google
                    Authenticator, Authy, etc.)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status banner */}
                  {user.twoFactorEnabled ? (
                    <Alert>
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-700">2FA is Enabled</AlertTitle>
                      <AlertDescription>Your account is protected with two-factor authentication.</AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="warning">
                      <ShieldOff className="h-4 w-4" />
                      <AlertTitle>2FA is Disabled</AlertTitle>
                      <AlertDescription>Enable two-factor authentication for stronger security.</AlertDescription>
                    </Alert>
                  )}

                  <Separator />

                  {/* MFA: idle state */}
                  {mfaStep === "idle" && (
                    <>
                      {!user.twoFactorEnabled ? (
                        <Button onClick={handleMfaSetup} disabled={mfaLoading} className="w-full">
                          {mfaLoading ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-4 w-4 mr-2" />
                          )}
                          Setup Two-Factor Authentication
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => { setMfaStep("disable"); setMfaCode(""); }}
                          className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <ShieldOff className="h-4 w-4 mr-2" />
                          Disable Two-Factor Authentication
                        </Button>
                      )}
                    </>
                  )}

                  {/* MFA: show QR code to scan then verify */}
                  {mfaStep === "verify" && mfaSetupData && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">1. Scan this QR code with your authenticator app:</p>
                        <div className="flex justify-center p-4 bg-white rounded-lg border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={mfaSetupData.qrCodeUri}
                            alt="MFA QR Code"
                            className="w-48 h-48"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Or enter this secret manually:</p>
                        <code className="block bg-secondary px-3 py-2 rounded text-xs font-mono break-all">
                          {mfaSetupData.secret}
                        </code>
                      </div>
                      {mfaSetupData.backupCodes && mfaSetupData.backupCodes.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-1">Backup codes (save these!):</p>
                          <div className="grid grid-cols-2 gap-1">
                            {mfaSetupData.backupCodes.map((code) => (
                              <code key={code} className="bg-secondary px-2 py-1 rounded text-xs font-mono text-center">
                                {code}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium mb-2">2. Enter the 6-digit code from your app:</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="000000"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="text-center text-lg tracking-widest font-mono"
                            maxLength={6}
                          />
                          <Button onClick={handleMfaVerify} disabled={mfaLoading || mfaCode.length !== 6}>
                            {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
                          </Button>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMfaStep("idle"); setMfaSetupData(null); setMfaCode(""); }}>
                        Cancel
                      </Button>
                    </div>
                  )}

                  {/* MFA: disable confirmation */}
                  {mfaStep === "disable" && (
                    <div className="space-y-3">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Enter your current authenticator code to disable 2FA.
                        </AlertDescription>
                      </Alert>
                      <div className="flex gap-2">
                        <Input
                          placeholder="000000"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="text-center text-lg tracking-widest font-mono"
                          maxLength={6}
                        />
                        <Button
                          variant="destructive"
                          onClick={handleMfaDisable}
                          disabled={mfaLoading || mfaCode.length !== 6}
                        >
                          {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disable"}
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setMfaStep("idle"); setMfaCode(""); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Sessions Tab ─── */}
          <TabsContent value="sessions">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Active Sessions</h3>
                  <p className="text-sm text-muted-foreground">
                    Maximum 3 concurrent sessions. Oldest session is removed when limit is reached.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={loadSessions} disabled={sessionsLoading}>
                    {sessionsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleLogoutAll}>
                    <LogOut className="h-4 w-4 mr-1.5" />
                    Logout All
                  </Button>
                </div>
              </div>

              {sessionsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sessions.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    No active sessions found.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session) => (
                    <Card
                      key={session.id}
                      className={session.current ? "border-primary/50 bg-primary/5" : ""}
                    >
                      <CardContent className="py-4 flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 p-1.5 rounded-full bg-secondary">
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{session.deviceInfo || "Unknown device"}</p>
                              {session.current && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  Current
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{session.ipAddress}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-xs">{session.userAgent}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Last active: {session.lastActiveAt ?? session.createdAt}
                            </p>
                          </div>
                        </div>
                        {!session.current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSession(session.id)}
                            disabled={deletingSession === session.id}
                            className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {deletingSession === session.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Login History Tab ─── */}
          <TabsContent value="history">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Login History</h3>
                  <p className="text-sm text-muted-foreground">Recent authentication events for your account.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadLoginHistory(0)}
                  disabled={historyLoading}
                >
                  {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>

              {historyLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : loginHistory.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    No login history available.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2">
                    {loginHistory.map((entry) => (
                      <Card key={entry.id}>
                        <CardContent className="py-3 flex items-start gap-3">
                          <div className="mt-0.5">
                            {entry.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  ACTION_COLORS[entry.action] ?? "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {entry.action.replace(/_/g, " ")}
                              </span>
                              <span className="text-xs text-muted-foreground">{entry.createdAt}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {entry.ipAddress && (
                                <span className="text-xs text-muted-foreground">{entry.ipAddress}</span>
                              )}
                              {entry.deviceInfo && (
                                <span className="text-xs text-muted-foreground">{entry.deviceInfo}</span>
                              )}
                            </div>
                            {entry.failureReason && (
                              <p className="text-xs text-red-500 mt-1">{entry.failureReason}</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {historyHasMore && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => loadLoginHistory(historyPage + 1, true)}
                        disabled={historyLoadingMore}
                      >
                        {historyLoadingMore ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Load More
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>
          {/* ─── Notifications Tab ─── */}
          <TabsContent value="notifications">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    {unreadCount > 0
                      ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
                      : "All caught up!"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => loadNotifications(0)} disabled={notifLoading}>
                    {notifLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  {unreadCount > 0 && (
                    <Button variant="outline" size="sm" onClick={handleMarkAllNotifRead} disabled={markingAllRead}>
                      {markingAllRead ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4 mr-1.5" />
                      )}
                      Mark All Read
                    </Button>
                  )}
                </div>
              </div>

              {notifLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : notifications.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground text-sm">
                    <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No notifications yet.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2">
                    {notifications.map((notif) => (
                      <Card key={notif.id} className={notif.isRead ? "opacity-70" : "border-primary/30 bg-primary/5"}>
                        <CardContent className="py-3 flex items-start gap-3">
                          <div className="mt-0.5">
                            {notif.isRead ? (
                              <BellOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Bell className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{notif.title}</p>
                                <p className="text-sm text-muted-foreground">{notif.message}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!notif.isRead && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleMarkNotifRead(notif.id)}
                                    title="Mark as read"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDeleteNotif(notif.id)}
                                  disabled={deletingNotif === notif.id}
                                  title="Delete"
                                >
                                  {deletingNotif === notif.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="secondary" className="text-xs">{notif.type}</Badge>
                              <span className="text-xs text-muted-foreground">{notif.createdAt}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {notifHasMore && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => loadNotifications(notifPage + 1, true)}
                        disabled={notifLoadingMore}
                      >
                        {notifLoadingMore ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Load More
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ─── Health Tab ─── */}
          <TabsContent value="health">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    System Health
                  </CardTitle>
                  <CardDescription>Status of all backend dependencies</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadHealth} disabled={healthLoading}>
                  {healthLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                {healthLoading && !healthData ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !healthData ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Click the refresh button to check health status.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Overall status */}
                    <div className={`flex items-center gap-3 p-3 rounded-lg ${
                      healthData.status === "ok"
                        ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                        : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                    }`}>
                      {healthData.status === "ok" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                      )}
                      <div>
                        <p className={`font-semibold text-sm ${
                          healthData.status === "ok" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
                        }`}>
                          Overall: {healthData.status === "ok" ? "All Systems Operational" : "Degraded"}
                        </p>
                        <p className="text-xs text-muted-foreground">{healthData.timestamp}</p>
                      </div>
                    </div>

                    {/* Individual checks */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Database */}
                      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                        healthData.checks.database.status === "up"
                          ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
                          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                      }`}>
                        <Database className={`h-5 w-5 shrink-0 ${
                          healthData.checks.database.status === "up" ? "text-green-600 dark:text-green-400" : "text-red-500"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Database</p>
                          <Badge variant={healthData.checks.database.status === "up" ? "default" : "destructive"} className="text-xs">
                            {healthData.checks.database.status.toUpperCase()}
                          </Badge>
                          {healthData.checks.database.error && (
                            <p className="text-xs text-red-500 mt-1 truncate">{healthData.checks.database.error}</p>
                          )}
                        </div>
                      </div>

                      {/* Redis */}
                      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                        healthData.checks.redis.status === "up"
                          ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
                          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                      }`}>
                        <Server className={`h-5 w-5 shrink-0 ${
                          healthData.checks.redis.status === "up" ? "text-green-600 dark:text-green-400" : "text-red-500"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Redis</p>
                          <Badge variant={healthData.checks.redis.status === "up" ? "default" : "destructive"} className="text-xs">
                            {healthData.checks.redis.status.toUpperCase()}
                          </Badge>
                          {healthData.checks.redis.error && (
                            <p className="text-xs text-red-500 mt-1 truncate">{healthData.checks.redis.error}</p>
                          )}
                        </div>
                      </div>

                      {/* MinIO */}
                      <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                        healthData.checks.minio.status === "up"
                          ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10"
                          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
                      }`}>
                        <Shield className={`h-5 w-5 shrink-0 ${
                          healthData.checks.minio.status === "up" ? "text-green-600 dark:text-green-400" : "text-red-500"
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">MinIO</p>
                          <Badge variant={healthData.checks.minio.status === "up" ? "default" : "destructive"} className="text-xs">
                            {healthData.checks.minio.status.toUpperCase()}
                          </Badge>
                          {healthData.checks.minio.error && (
                            <p className="text-xs text-red-500 mt-1 truncate">{healthData.checks.minio.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}