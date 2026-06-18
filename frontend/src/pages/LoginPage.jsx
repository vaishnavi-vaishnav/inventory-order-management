import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Package } from "@phosphor-icons/react";
import { toast } from "sonner";

const WAREHOUSE_IMG =
  "https://images.unsplash.com/photo-1694885169342-909981fb408a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwyfHxjbGVhbiUyMG1vZGVybiUyMHdhcmVob3VzZSUyMGFyY2hpdGVjdHVyZXxlbnwwfHx8fDE3ODE2MTE3MzF8MA&ixlib=rb-4.1.0&q=85";

export default function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (user === undefined) return null;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await login(email.trim().toLowerCase(), password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
    } else {
      toast.success("Signed in");
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-12">
            <div className="h-9 w-9 bg-primary text-primary-foreground grid place-items-center rounded-sm">
              <Package size={20} weight="bold" />
            </div>
            <div>
              <div className="font-heading text-lg font-black tracking-tight">STOCKHAUS</div>
              <div className="text-data-label -mt-0.5">Inventory Control</div>
            </div>
          </div>

          <h1 className="font-heading text-4xl font-bold tracking-tight leading-none">
            Operator Sign-In
          </h1>
          <p className="text-sm text-muted-foreground mt-3 mb-10">
            Authorized personnel only. Use the seeded admin credentials to access the
            control panel.
          </p>

          <Card className="surface-card p-6 rounded-sm">
            <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-data-label">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email-input"
                  className="rounded-sm font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-data-label">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password-input"
                  className="rounded-sm font-mono"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive" data-testid="login-error">{error}</p>
              )}
              <Button
                type="submit"
                disabled={submitting}
                data-testid="login-submit-button"
                className="w-full rounded-sm font-medium hover:-translate-y-[1px] transition-transform active:translate-y-0"
              >
                {submitting ? "Authenticating..." : "Sign In"}
              </Button>
            </form>
          </Card>

          <div className="mt-8 text-xs text-muted-foreground font-mono">
            Demo: admin@example.com / admin123
          </div>
        </div>
      </div>
      <div
        className="hidden lg:block relative bg-cover bg-center"
        style={{ backgroundImage: `url(${WAREHOUSE_IMG})` }}
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <div className="text-data-label text-white/70 mb-3">/ Live Operations</div>
          <div className="font-heading text-3xl font-bold leading-tight max-w-md">
            Real-time inventory. Disciplined orders. Zero stockouts.
          </div>
        </div>
      </div>
    </div>
  );
}
