import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { StoreProvider } from './store.tsx'
import { GamesProvider } from './games.tsx'
import { CategoriesProvider } from './categories.tsx'
import { VocabProvider } from './vocab.tsx'
import { TooltipProvider } from './components/ui/tooltip.tsx'

/* the order matters: the vocabulary refreshes games and categories after a
   change, and the studio writes a word's recordings through the vocabulary */
/* a data router (not BrowserRouter) only so that `useBlocker` works: a form
   with unsaved changes can stop the browser's back/forward too. The routes
   themselves stay in App.tsx, under one catch-all route. */
const Root = () => (
      <TooltipProvider delayDuration={300}>
        <AuthGate>
          <GamesProvider>
            <CategoriesProvider>
              <VocabProvider>
                <StoreProvider>
                  <App />
                </StoreProvider>
              </VocabProvider>
            </CategoriesProvider>
          </GamesProvider>
        </AuthGate>
      </TooltipProvider>
)
const router = createBrowserRouter([{ path: "*", element: <Root /> }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
