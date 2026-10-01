import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// A company admin's order link (/?order=<token>) opens the public order page, not the dashboard.
const orderToken = new URLSearchParams(window.location.search).get('order')
// The stock buyer's link (/?buy=<token>) opens his page for that delivery date.
const buyToken = new URLSearchParams(window.location.search).get('buy')

// iPhone Safari only shows :active (pressed) styles once the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true })

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.log('Service worker registration failed:', err))
  })
}

const root = createRoot(document.getElementById('root'))
if (buyToken) {
  import('./PublicBuyer.jsx').then(({ default: PublicBuyer }) => root.render(<StrictMode><PublicBuyer token={buyToken} /></StrictMode>))
} else if (orderToken) {
  import('./PublicOrder.jsx').then(({ default: PublicOrder }) => root.render(<StrictMode><PublicOrder token={orderToken} /></StrictMode>))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
