import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  Gauge,
  Package,
  Tag,
  Users,
  ShoppingCart,
  SignOut,
  List,
  FileArrowUp,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: Gauge, end: true, testid: "nav-dashboard" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: "/products", label: "Products", icon: Package, testid: "nav-products" },
      { to: "/bulk-import", label: "Bulk Import", icon: FileArrowUp, testid: "nav-bulk-import" },
      { to: "/categories", label: "Categories", icon: Tag, testid: "nav-categories" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/customers", label: "Customers", icon: Users, testid: "nav-customers" },
      { to: "/orders", label: "Orders", icon: ShoppingCart, testid: "nav-orders" },
    ],
  },
];

function NavItems({ onNavigate, mobile = false }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end, testid }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                data-testid={mobile ? `${testid}-mobile` : testid}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`
                }
              >
                <Icon size={18} />
                <span className="font-medium">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen bg-secondary/30">
      <aside className="fixed left-0 top-0 z-30 hidden md:flex flex-col h-screen w-64 bg-background border-r border-border">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border shrink-0">
          <div className="h-8 w-8 bg-primary text-primary-foreground grid place-items-center rounded-sm">
            <Package size={18} weight="bold" />
          </div>
          <div>
            <div className="font-heading text-sm font-black tracking-tight">Inventory Manager</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground -mt-0.5">
              Control Panel
            </div>
          </div>
        </div>
        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          <NavItems />
        </nav>
        <div className="border-t border-border p-4 space-y-2 shrink-0">
          <div className="text-data-label">Signed in</div>
          <div className="text-sm font-mono truncate" data-testid="sidebar-user-email">
            {user?.email}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            data-testid="sidebar-logout-button"
            className="w-full rounded-sm"
          >
            <SignOut size={16} className="mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-30 h-14 bg-background/80 backdrop-blur-md border-b border-border flex items-center px-4 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 rounded-sm"
            onClick={() => setMenuOpen(true)}
            data-testid="mobile-menu-button"
            aria-label="Open menu"
          >
            <List size={18} />
          </Button>
          <div className="h-7 w-7 bg-primary text-primary-foreground grid place-items-center rounded-sm shrink-0">
            <Package size={16} weight="bold" />
          </div>
          <div className="font-heading text-sm font-black tracking-tight truncate">Inventory Manager</div>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[min(100vw-3rem,18rem)] p-0 flex flex-col rounded-none" data-testid="mobile-nav-sheet">
          <SheetHeader className="h-16 flex flex-row items-center gap-3 px-5 border-b border-border text-left space-y-0 shrink-0">
            <div className="h-8 w-8 bg-primary text-primary-foreground grid place-items-center rounded-sm shrink-0">
              <Package size={18} weight="bold" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="font-heading text-sm font-black tracking-tight text-left">
                Inventory Manager
              </SheetTitle>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground -mt-0.5">
                Control Panel
              </div>
            </div>
          </SheetHeader>
          <nav className="flex-1 overflow-y-auto py-4 px-2">
            <NavItems mobile onNavigate={closeMenu} />
          </nav>
          <div className="border-t border-border p-4 space-y-2 shrink-0">
            <div className="text-data-label">Signed in</div>
            <div className="text-sm font-mono truncate" data-testid="mobile-sidebar-user-email">
              {user?.email}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              data-testid="mobile-logout-button"
              className="w-full rounded-sm"
            >
              <SignOut size={16} className="mr-2" />
              Sign out
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <main className="md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10 animate-in fade-in duration-300">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
