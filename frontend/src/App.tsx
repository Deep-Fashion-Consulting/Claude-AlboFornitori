import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthProvider';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Feedback';
import { LoginPage } from './pages/LoginPage';
import { PasswordPage } from './pages/PasswordPage';
import { SearchPage } from './pages/SearchPage';
import { NewSupplierPage } from './pages/NewSupplierPage';
import { AdminListsPage } from './pages/AdminListsPage';
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
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/fornitori" replace />} />
        <Route path="fornitori" element={<SearchPage />} />
        <Route path="fornitori/nuovo" element={<NewSupplierPage />} />
        <Route path="profilo/password" element={<PasswordPage />} />
        <Route path="fornitori/:id" element={<SupplierScope />}>
          <Route index element={<Navigate to="anagrafica" replace />} />
          <Route path="anagrafica" element={<SupplierGeneralPage />} />
          <Route path="societa" element={<CompanyPage />} />
          {/* Sezioni dei prossimi moduli */}
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
        <Route path="report/*" element={<PlaceholderPage />} />
        <Route path="amministrazione/liste" element={<AdminListsPage />} />
        <Route path="amministrazione/*" element={<PlaceholderPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
