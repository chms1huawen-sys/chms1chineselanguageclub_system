import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { prepareAppLaunch } from './utils/pwaLaunch'

prepareAppLaunch()

// Keep public SSR visible until its renderer is ready; member launches skip this download.
if (!window.location.hash.startsWith('#/') && window.location.pathname !== '/blog-admin') {
  await import('./pages/Blog')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then((registration) => {
      console.log('SW registered:', registration);
    })
    .catch((error) => {
      console.error('SW registration failed:', error);
    });
}
