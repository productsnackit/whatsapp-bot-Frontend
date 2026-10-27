import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startAutoUpdate } from './autoUpdate.js'

// A company admin's order link (/?order=<token>) opens the public order page, not the dashboard.
const orderToken = new URLSearchParams(window.location.search).get('order')
// The stock buyer's link (/?buy=<token>) opens his page for that delivery date.
const buyToken = new URLSearchParams(window.location.search).get('buy')
// Company admins' own login and shop (/?shop): ClientPortal.jsx.
const shopPortal = new URLSearchParams(window.location.search).has('shop')

// iPhone Safari only shows :active (pressed) styles once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true })

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.log('Service worker registration failed:', err))
  })
}

// New versions reach phones and the home-screen app without closing it.
startAutoUpdate()

const root = createRoot(document.getElementById('root'))
if (buyToken) {
  import('./PublicBuyer.jsx').then(({ default: PublicBuyer }) => root.render(<StrictMode><PublicBuyer token={buyToken} /></StrictMode>))
} else if (shopPortal) {
  import('./ClientPortal.jsx').then(({ default: ClientPortal }) => root.render(<StrictMode><ClientPortal /></StrictMode>))
} else if (orderToken) {
  import('./PublicOrder.jsx').then(({ default: PublicOrder }) => root.render(<StrictMode><PublicOrder token={orderToken} /></StrictMode>))
} else if (localStorage.getItem('userRole') === 'refiller' && localStorage.getItem('token')) {
  // A refiller's login opens their own simple app.
  import('./RefillerApp.jsx').then(({ default: RefillerApp }) => root.render(<StrictMode><RefillerApp /></StrictMode>))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
