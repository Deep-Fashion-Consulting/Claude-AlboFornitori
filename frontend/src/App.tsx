import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Feedback';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { LoginPage } from './pages/LoginPage';
import { SearchPage } from './pages/SearchPage';
import { NotFoundPage, PlaceholderPage, SupplierScope } from './pages/SimplePages';
import { SupplierGeneralPage } from './pages/SupplierGeneralPage';
import { CompanyPage } from './pages/CompanyPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="login">
        <Loading />
      </div>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to="/accesso" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/accesso" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/fornitori" replace />} />
        <Route path="fornitori" element={<SearchPage />} />
        <Route path="fornitori/:id" element={<SupplierScope />}>
          <Route index element={<Navigate to="anagrafica" replace />} />
          <Route path="anagrafica" element={<SupplierGeneralPage />} />
          <Route path="societa" element={<CompanyPage />} />
          {/* Sezioni dei prossimi moduli */}
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
        <Route path="report/*" element={<PlaceholderPage />} />
        <Route path="amministrazione/*" element={<PlaceholderPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
