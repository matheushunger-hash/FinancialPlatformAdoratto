import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Adoratto",
};

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-muted-foreground">
        Bem-vindo à plataforma financeira da Adoratto.
      </p>
    </div>
  );
}
