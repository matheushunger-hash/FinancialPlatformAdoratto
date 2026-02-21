import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// This layout wraps every page under /dashboard/*.
// It runs on the server and does two things:
//   1. Checks if the user is authenticated (defense in depth — middleware already checks,
//      but this is a second safety net in case middleware config changes)
//   2. Fetches the user's profile from Prisma (name, role) so we can show it in the sidebar

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login");
  }

  // Fetch the user's profile from Prisma.
  // The Prisma User and Supabase Auth user share the same UUID,
  // so we can look up by authUser.id directly.
  const profile = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { name: true, role: true },
  });

  // If the user exists in Supabase Auth but not in Prisma,
  // something went wrong with seeding. Redirect to login.
  if (!profile) {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <AppSidebar userName={profile.name} userRole={profile.role} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
