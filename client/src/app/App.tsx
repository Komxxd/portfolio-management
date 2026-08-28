import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { CurrencyProvider } from './providers/CurrencyProvider';
import { AuthProvider } from './providers/AuthProvider';
import { PortfolioProvider } from '../features/portfolio/hooks/PortfolioContext';
import { router } from './router';

export default function App() {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AuthProvider>
          <PortfolioProvider>
            <RouterProvider router={router} />
          </PortfolioProvider>
        </AuthProvider>
      </CurrencyProvider>
    </ThemeProvider>
  );
}
