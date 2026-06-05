import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

// No StrictMode: double-invoked effects would spawn duplicate PTYs.
createRoot(root).render(<App />)
