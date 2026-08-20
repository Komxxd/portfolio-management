import React, { useState, useEffect } from 'react';
import { api } from '../../../services/api/client';
import { useAuth } from '../../../app/providers/AuthProvider';
import { useNavigate } from 'react-router-dom';

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { session, refreshSession } = useAuth();

  useEffect(() => {
    if (session) {
      navigate('/portfolios');
    }
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let response;
      if (isLogin) {
        response = await api.post('/api/auth/login', { email, password });
      } else {
        response = await api.post('/api/auth/signup', { email, password });
      }

      if (response && response.session && response.session.access_token) {
        localStorage.setItem('auth_token', response.session.access_token);
      }

      await refreshSession();
      navigate('/portfolios');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface border border-divider rounded-xl shadow-lg p-8">
        <div className="flex justify-center mb-6">
          <img src="/favicon.svg" alt="Logo" className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-semibold text-primary mb-6 text-center">
          {isLogin ? 'Welcome back' : 'Create an account'}
        </h2>
        
        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded text-danger text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-background border border-divider rounded-lg px-4 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-background border border-divider rounded-lg px-4 py-2 text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : (isLogin ? 'Sign in' : 'Sign up')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-secondary">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-500 hover:text-blue-400 font-medium"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
