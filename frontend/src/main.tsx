import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

console.log('🚀 main.tsx: Starting application...')

try {
  console.log('🔍 main.tsx: Looking for root container...')
  const container = document.getElementById('root')
  
  if (container) {
    console.log('✅ main.tsx: Root container found:', container)
    console.log('🔍 main.tsx: Creating React root...')
    const root = createRoot(container)
    
    console.log('🔍 main.tsx: Rendering App component...')
    root.render(<App />)
    
    console.log('✅ main.tsx: JarViewer application initialized successfully!')
    
    // Add a visual indicator to the page
    setTimeout(() => {
      const indicator = document.createElement('div')
      indicator.innerHTML = '✅ JavaScript is working!'
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: green;
        color: white;
        padding: 10px;
        border-radius: 5px;
        z-index: 9999;
        font-family: Arial, sans-serif;
      `
      document.body.appendChild(indicator)
      
      setTimeout(() => {
        document.body.removeChild(indicator)
      }, 3000)
    }, 1000)
    
  } else {
    console.error('❌ main.tsx: Root container not found!')
    document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: Arial;">❌ Error: Root container not found!</div>'
  }
} catch (error) {
  console.error('❌ main.tsx: Error initializing application:', error)
  document.body.innerHTML = `<div style="padding: 20px; color: red; font-family: Arial;">❌ Error: ${error.message}</div>`
}
