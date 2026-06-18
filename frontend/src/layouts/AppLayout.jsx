import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  Gauge,
  Package,
  Users,
  ShoppingCart,
  SignOut,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: Gauge, end: true, testid: "nav-dashboard" },
  { to: "/products", label: "Products", icon: Package, testid: "nav-products" },
  { to: "/customers", label: "Customers", icon: Users, testid: "nav-customers" },
  { to: "/orders", label: "Orders", icon: ShoppingCart, testid: "nav-orders" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <aside className="fixed left-0 top-0 z-30 hidden md:flex flex-col h-screen w-64 bg-background border-r border-border">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border">
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
        <nav className="flex-1 py-4">
          {NAV.map(({ to, label, icon: Icon, end, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 mx-3 my-0.5 px-3 py-2 rounded-sm text-sm transition-colors ${
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
        </nav>
        <div className="border-t border-border p-4 space-y-2">
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
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-primary text-primary-foreground grid place-items-center rounded-sm">
            <Package size={16} weight="bold" />
          </div>
          <div className="font-heading text-sm font-black tracking-tight">Inventory Manager</div>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout} data-testid="mobile-logout-button">
          <SignOut size={14} />
        </Button>
      </header>
      <nav className="md:hidden sticky top-14 z-20 bg-background border-b border-border flex overflow-x-auto">
        {NAV.map(({ to, label, icon: Icon, end, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            data-testid={`${testid}-mobile`}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-3 text-xs whitespace-nowrap border-b-2 ${
                isActive
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground"
              }`
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="md:pl-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10 animate-in fade-in duration-300">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
