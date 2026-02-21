import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Login — Adoratto",
};

// This is a Server Component — it just sets up the page structure
// and renders the interactive LoginForm client component inside it.

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Adoratto</h1>
          <p className="mt-1 text-sm text-muted-foreground">Plataforma Financeira</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
