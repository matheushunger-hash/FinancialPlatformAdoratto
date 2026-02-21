import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The header bar shown at the top of every dashboard page.
// It receives userName and userRole as props from the layout.
// The logout button uses a <form> with the signOut server action —
// this way it works even without JavaScript (progressive enhancement).

const roleLabels: Record<string, string> = {
  ADMIN: "Diretor",
  USER: "Analista",
};

interface DashboardHeaderProps {
  userName: string;
  userRole: string;
}

export function DashboardHeader({ userName, userRole }: DashboardHeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <span className="text-lg font-semibold tracking-tight">Adoratto</span>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userName}</span>
          <Badge variant="secondary">{roleLabels[userRole] ?? userRole}</Badge>

          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon" title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
