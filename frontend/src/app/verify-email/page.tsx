"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Loader2, MailCheck } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setMessage(err?.message || "Verification failed. Link may be expired.");
      });
  }, [token]);

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        {status === "loading" && (
          <>
            <div className="flex justify-center mb-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <CardTitle>Verifying Email...</CardTitle>
            <CardDescription>Please wait while we verify your email address.</CardDescription>
          </>
        )}
        {status === "success" && (
          <>
            <div className="flex justify-center mb-3">
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <CardTitle>Email Verified! &#x2705;</CardTitle>
            <CardDescription>Your email has been successfully verified.</CardDescription>
          </>
        )}
        {status === "error" && (
          <>
            <div className="flex justify-center mb-3">
              <div className="p-3 rounded-full bg-red-100">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <CardTitle>Verification Failed</CardTitle>
            <CardDescription>{message}</CardDescription>
          </>
        )}
      </CardHeader>
      {status !== "loading" && (
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Go to Login</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md p-8 text-center">
            <div className="flex justify-center">
              <MailCheck className="h-10 w-10 text-primary" />
            </div>
          </Card>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}