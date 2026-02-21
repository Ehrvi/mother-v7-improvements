/**
 * MOTHER v7.0 - Secure Signup Page
 *
 * Features:
 * - Strong password requirements (12+ chars, uppercase, lowercase, number, special)
 * - Real-time validation feedback
 * - Password strength indicator
 * - Error handling with user-friendly messages
 * - Loading states
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function Signup() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const signupMutation = trpc.auth.signup.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        setLocation("/login");
      }, 2000);
    },
    onError: error => {
      setError(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    signupMutation.mutate({ name, email, password });
  };

  // Password strength validation
  const passwordRequirements = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const allRequirementsMet = Object.values(passwordRequirements).every(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-indigo-900 to-cyan-900 p-4">
      <Card className="w-full max-w-md bg-black/40 backdrop-blur-xl border-purple-500/30">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Create Account
          </CardTitle>
          <CardDescription className="text-center text-gray-300">
            Join MOTHER v7.0 - Advanced AI System
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <Alert className="bg-green-500/20 border-green-500/50">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-300">
                Account created successfully! Redirecting to login...
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert className="bg-red-500/20 border-red-500/50">
                  <XCircle className="h-4 w-4 text-red-400" />
                  <AlertDescription className="text-red-300">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-200">
                  Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  className="bg-black/50 border-purple-500/30 text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-200">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  maxLength={320}
                  className="bg-black/50 border-purple-500/30 text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-200">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="bg-black/50 border-purple-500/30 text-white placeholder:text-gray-500"
                />

                {password && (
                  <div className="space-y-2 mt-3 p-3 bg-black/30 rounded-lg border border-purple-500/20">
                    <p className="text-xs text-gray-300 font-medium">
                      Password Requirements:
                    </p>
                    <div className="space-y-1">
                      <PasswordRequirement
                        met={passwordRequirements.length}
                        text="At least 12 characters"
                      />
                      <PasswordRequirement
                        met={passwordRequirements.uppercase}
                        text="One uppercase letter (A-Z)"
                      />
                      <PasswordRequirement
                        met={passwordRequirements.lowercase}
                        text="One lowercase letter (a-z)"
                      />
                      <PasswordRequirement
                        met={passwordRequirements.number}
                        text="One number (0-9)"
                      />
                      <PasswordRequirement
                        met={passwordRequirements.special}
                        text="One special character (!@#$%...)"
                      />
                    </div>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-700 hover:to-cyan-700 text-white font-semibold"
                disabled={signupMutation.isPending || !allRequirementsMet}
              >
                {signupMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>

              <p className="text-center text-sm text-gray-400">
                Already have an account?{" "}
                <Link href="/login">
                  <a className="text-cyan-400 hover:text-cyan-300 font-medium">
                    Login here
                  </a>
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <CheckCircle2 className="h-3 w-3 text-green-400 flex-shrink-0" />
      ) : (
        <XCircle className="h-3 w-3 text-gray-500 flex-shrink-0" />
      )}
      <span className={met ? "text-green-400" : "text-gray-500"}>{text}</span>
    </div>
  );
}
