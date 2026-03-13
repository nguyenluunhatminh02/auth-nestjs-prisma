"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { useAuthStore } from "@/lib/auth-store";
import { useToastStore } from "@/lib/toast-store";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import { api, getOAuthAuthorizeUrl, type ApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Github, Loader2, ShieldCheck, ShoppingBag, Smartphone } from "lucide-react";

const mfaSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d+$/, "Digits only"),
});
type MfaValues = z.infer<typeof mfaSchema>;

export default function LoginPage() {
  const { login, setAuthData } = useAuthStore();
  const { showToast } = useToastStore();
  const router = useRouter();
  const [mfaTempToken, setMfaTempToken] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { isSubmitting, errors } = form.formState;

  const mfaForm = useForm<MfaValues>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { code: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    try {
      const result = await login(values.email, values.password);
      if (result?.mfaRequired && result?.mfaTempToken) {
        setMfaTempToken(result.mfaTempToken);
        return;
      }
      showToast("Login successful!", "success");
      router.push("/dashboard");
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      form.setError("root", { message: apiErr.message || "Login failed" });
    }
  };

  const onMfaSubmit = async (values: MfaValues) => {
    try {
      const res = await api.mfaValidate(mfaTempToken!, values.code);
      if (res.data) {
        setAuthData(res.data);
        showToast("Login successful!", "success");
        router.push("/dashboard");
      }
    } catch (err) {
      const apiErr = err as ApiResponse<unknown>;
      mfaForm.setError("root", { message: apiErr.message || "Invalid code" });
    }
  };

  const handleOAuth2 = (provider: "google" | "github") => {
    window.location.href = getOAuthAuthorizeUrl(provider);
  };

  if (mfaTempToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <Smartphone className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Two-Factor Auth</CardTitle>
            <CardDescription>Enter the 6-digit code from your authenticator app</CardDescription>
          </CardHeader>
          <CardContent>
            {mfaForm.formState.errors.root && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{mfaForm.formState.errors.root.message}</AlertDescription>
              </Alert>
            )}
            <Form {...mfaForm}>
              <form onSubmit={mfaForm.handleSubmit(onMfaSubmit)} className="space-y-4">
                <FormField
                  control={mfaForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authenticator Code</FormLabel>
                      <FormControl>
                        <Input placeholder="000000" maxLength={6} inputMode="numeric" className="text-center text-2xl tracking-widest" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={mfaForm.formState.isSubmitting}>
                  {mfaForm.formState.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Verify
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setMfaTempToken(null)}>
                  Back to login
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShoppingBag className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => handleOAuth2("google")} type="button">
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </Button>
            <Button variant="outline" className="w-full" onClick={() => handleOAuth2("github")} type="button">
              <Github className="h-4 w-4 mr-2" />
              Continue with GitHub
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or continue with email</span>
            <Separator className="flex-1" />
          </div>
          {errors.root && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input placeholder="you@example.com" type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                  </div>
                  <FormControl><Input placeholder="••••••••" type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sign In
              </Button>
            </form>
          </Form>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">Register</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}