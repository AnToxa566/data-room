import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { App } from './app';
import { queryClient, tsr } from './lib/api';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <tsr.ReactQueryProvider>
        <App />
      </tsr.ReactQueryProvider>
    </QueryClientProvider>
  </StrictMode>,
);
