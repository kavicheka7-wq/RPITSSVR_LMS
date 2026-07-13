import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // បន្ទាត់នេះសំខាន់បំផុត ដើម្បីទាញ Tailwind មកប្រើ

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)