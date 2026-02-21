// The main sidebar component that assembles all the pieces.
// This is a Server Component — it doesn't use any hooks or browser APIs.
// It just takes data (nav items + user info) and passes it down to
// the Client Components (NavMain and NavUser) that handle interactivity.

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  userName: string;
  userRole: string;
}

export function AppSidebar({ userName, userRole, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex h-8 items-center px-2 text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          Adoratto
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavMain />
      </SidebarContent>

      <SidebarFooter>
        <NavUser userName={userName} userRole={userRole} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
