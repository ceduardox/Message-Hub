import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

import LoginPage from "@/pages/LoginPage";
import InboxPage from "@/pages/InboxPage";
import AIAgentPage from "@/pages/AIAgentPage";
import FollowUpPage from "@/pages/FollowUpPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import NotFound from "@/pages/not-found";

// Protected Route Wrapper - No loading spinner, goes directly to content or login
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // While loading, render component optimistically (assumes user is logged in)
  // This avoids showing a loading spinner and lets the chat appear immediately
  if (isLoading) {
    return <Component />;
  }

  if (!user) {
    setTimeout(() => setLocation("/login"), 0);
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/ai-agent">
        <ProtectedRoute component={AIAgentPage} />
      </Route>
      <Route path="/follow-up">
        <ProtectedRoute component={FollowUpPage} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={AnalyticsPage} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={InboxPage} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
