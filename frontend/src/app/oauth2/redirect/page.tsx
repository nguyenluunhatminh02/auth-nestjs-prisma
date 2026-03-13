"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useToastStore } from "@/lib/toast-store";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

function OAuth2RedirectHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setAuthData } = useAuthStore();
  const { showToast } = useToastStore();

  useEffect(() => {
    const token = searchParams.get("token");
    const refreshToken = searchParams.get("refresh_token");
    const error = searchParams.get("error");

    if (error) {
      showToast(`OAuth2 login failed: ${error}`, "error");
      router.replace("/login");
      return;
    }

    if (!token || !refreshToken) {
      showToast("OAuth2 login failed: missing tokens", "error");
      router.replace("/login");
      return;
    }

    // Store tokens first so api calls use them
    localStorage.setItem("accessToken", token);
    localStorage.setItem("refreshToken", refreshToken);

    // Fetch user info via refresh to get full AuthData
    api
      .refreshToken(refreshToken)
      .then((res) => {
        if (res.data) {
          setAuthData(res.data);
          showToast("Login successful!", "success");
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        showToast("OAuth2 login failed", "error");
        router.replace("/login");
      });
  }, [searchParams, router, setAuthData, showToast]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-muted-foreground">Completing sign in...</p>
    </div>
  );
}

export default function OAuth2RedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      }
    >
      <OAuth2RedirectHandler />
    </Suspense>
  );
}
