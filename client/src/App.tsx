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
import AgentsPage from "@/pages/AgentsPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import DataDeletionPage from "@/pages/DataDeletionPage";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return <Component />;
  }

  if (!user) {
    setTimeout(() => setLocation("/login"), 0);
    return null;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (!user) {
    setTimeout(() => setLocation("/login"), 0);
    return null;
  }

  if (!isAdmin) {
    setTimeout(() => setLocation("/"), 0);
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/data-deletion" component={DataDeletionPage} />
      <Route path="/ai-agent">
        <AdminRoute component={AIAgentPage} />
      </Route>
      <Route path="/follow-up">
        <AdminRoute component={FollowUpPage} />
      </Route>
      <Route path="/analytics">
        <ProtectedRoute component={AnalyticsPage} />
      </Route>
      <Route path="/agents">
        <AdminRoute component={AgentsPage} />
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
