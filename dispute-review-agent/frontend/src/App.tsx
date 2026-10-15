import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { PageTransition } from "@/components/PageTransition";
import { Layout } from "@/components/Layout";

const Dashboard = lazy(() => import('./pages/Dashboard'));
const SubmitCase = lazy(() => import('./pages/SubmitCase'));
const CaseDetail = lazy(() => import('./pages/CaseDetail'));
const Precedents = lazy(() => import('./pages/Precedents'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-label="Loading page">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <AnimatedRoutes>
                <Route path="/" data-genie-title="Dashboard" data-genie-key="Dashboard" element={<PageTransition transition="slide-up"><Dashboard /></PageTransition>} />
                <Route path="/submit" data-genie-title="Submit case" data-genie-key="Submit" element={<PageTransition transition="slide-up"><SubmitCase /></PageTransition>} />
                <Route path="/cases/:id" data-genie-title="Case details" data-genie-key="CaseDetail" element={<PageTransition transition="slide-up"><CaseDetail /></PageTransition>} />
                <Route path="/precedents" data-genie-title="Precedents" data-genie-key="Precedents" element={<PageTransition transition="slide-up"><Precedents /></PageTransition>} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" data-genie-key="NotFound" data-genie-title="Not Found" element={<PageTransition transition="fade"><NotFound /></PageTransition>} />
              </AnimatedRoutes>
            </Suspense>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App
