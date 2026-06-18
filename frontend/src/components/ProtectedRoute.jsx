import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Authenticating…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
