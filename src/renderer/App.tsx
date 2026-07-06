import { useEffect } from 'react'
import { Box, Center, Spinner, Text, VStack } from '@chakra-ui/react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import DayPage from './pages/DayPage'
import FragmentPage from './pages/FragmentPage'
import CrushPage from './pages/CrushPage'
import SettingsPage from './pages/SettingsPage'
import HelpPage from './pages/HelpPage'
import UpdatePage from './pages/UpdatePage'
import ProgressPage from './pages/ProgressPage'
import OnboardingPage from './pages/OnboardingPage'
import { useAppStore } from './stores/appStore'

function AppRoutes() {
  const { hasFetchedCrushes, loading, fetchCrushes, needsOnboarding } = useAppStore()

  useEffect(() => {
    if (!hasFetchedCrushes && !loading) {
      fetchCrushes()
    }
  }, [fetchCrushes, hasFetchedCrushes, loading])

  if (!hasFetchedCrushes) {
    return (
      <Center h="100vh">
        <VStack spacing={3}>
          <Spinner size="xl" color="blue.500" />
          <Text color="gray.500">正在加载角色与首次上手状态...</Text>
        </VStack>
      </Center>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={needsOnboarding() ? <Navigate to="/onboarding" replace /> : <DayPage />}
        />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/fragment" element={<FragmentPage />} />
        <Route path="/crush" element={<CrushPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/update" element={<UpdatePage />} />
        <Route path="*" element={<Navigate to={needsOnboarding() ? '/onboarding' : '/'} replace />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <HashRouter>
      <Box minH="100vh">
        <AppRoutes />
      </Box>
    </HashRouter>
  )
}

export default App
