import React from 'react';
import { Auth as SupabaseAuth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../supabaseClient';

export const Auth: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-primary">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-secondary">
          Manage your portfolio effortlessly
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-surface py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-divider">
          <SupabaseAuth 
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#18181b', // zinc-900
                    brandAccent: '#27272a', // zinc-800
                  },
                },
              },
              className: {
                container: 'w-full',
                button: 'w-full flex justify-center py-2 px-4 border border-transparent rounded-md  text-sm font-medium text-primary bg-surface hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900',
                input: 'appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md  placeholder-gray-400 focus:outline-none focus:ring-zinc-500 focus:border-zinc-500 sm:text-sm',
                label: 'block text-sm font-medium text-secondary',
              }
            }}
            providers={[]}
          />
        </div>
      </div>
    </div>
  );
};
