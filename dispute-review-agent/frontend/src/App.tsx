import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route } from 'react-router-dom';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { PageTransition } from "@/components/PageTransition";
import { Layout } from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import SubmitCase from "./pages/SubmitCase";
import CaseDetail from "./pages/CaseDetail";
import NotFound from "./pages/NotFound";

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
            <AnimatedRoutes>
              <Route path="/" data-genie-title="仪表盘" data-genie-key="Dashboard" element={<PageTransition transition="slide-up"><Dashboard /></PageTransition>} />
              <Route path="/submit" data-genie-title="提交案件" data-genie-key="Submit" element={<PageTransition transition="slide-up"><SubmitCase /></PageTransition>} />
              <Route path="/cases/:id" data-genie-title="案件详情" data-genie-key="CaseDetail" element={<PageTransition transition="slide-up"><CaseDetail /></PageTransition>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" data-genie-key="NotFound" data-genie-title="Not Found" element={<PageTransition transition="fade"><NotFound /></PageTransition>} />
            </AnimatedRoutes>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App
