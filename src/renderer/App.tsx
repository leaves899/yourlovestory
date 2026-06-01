import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DayPage from './pages/DayPage'
import FragmentPage from './pages/FragmentPage'
import CrushPage from './pages/CrushPage'
import SettingsPage from './pages/SettingsPage'
import HelpPage from './pages/HelpPage'
import UpdatePage from './pages/UpdatePage'

function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DayPage />} />
          <Route path="/fragment" element={<FragmentPage />} />
          <Route path="/crush" element={<CrushPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/update" element={<UpdatePage />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}

export default App
