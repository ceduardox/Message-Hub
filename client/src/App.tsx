import { lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const InboxPage = lazy(() => import("@/pages/InboxPage"));
const AIAgentPage = lazy(() => import("@/pages/AIAgentPage"));
const FollowUpPage = lazy(() => import("@/pages/FollowUpPage"));
const RemindersPage = lazy(() => import("@/pages/RemindersPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const AgentsPage = lazy(() => import("@/pages/AgentsPage"));
const AgentAiPage = lazy(() => import("@/pages/AgentAiPage"));
const PushSettingsPage = lazy(() => import("@/pages/PushSettingsPage"));
const PrivacyPolicyPage = lazy(() => import("@/pages/PrivacyPolicyPage"));
const DataDeletionPage = lazy(() => import("@/pages/DataDeletionPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

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

function AgentRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, isAgent } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (!user) {
    setTimeout(() => setLocation("/login"), 0);
    return null;
  }

  if (!isAgent) {
    setTimeout(() => setLocation("/"), 0);
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Suspense fallback={null}>
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
        <Route path="/reminders">
          <AdminRoute component={RemindersPage} />
        </Route>
        <Route path="/analytics">
          <ProtectedRoute component={AnalyticsPage} />
        </Route>
        <Route path="/agent-ai">
          <AgentRoute component={AgentAiPage} />
        </Route>
        <Route path="/push-settings">
          <ProtectedRoute component={PushSettingsPage} />
        </Route>
        <Route path="/agents">
          <AdminRoute component={AgentsPage} />
        </Route>
        <Route path="/">
          <ProtectedRoute component={InboxPage} />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
