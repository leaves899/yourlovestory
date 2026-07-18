import { useEffect } from 'react'
import { Box, Center, Spinner, Text, VStack } from '@chakra-ui/react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import WorkbenchLayout from './components/WorkbenchLayout'
import DayPage from './pages/DayPage'
import FragmentPage from './pages/FragmentPage'
import CrushPage from './pages/CrushPage'
import SettingsPage from './pages/SettingsPage'
import HelpPage from './pages/HelpPage'
import UpdatePage from './pages/UpdatePage'
import ProgressPage from './pages/ProgressPage'
import OnboardingPage from './pages/OnboardingPage'
import AssistantPage from './pages/AssistantPage'
import WorkbenchHomePage from './pages/WorkbenchHomePage'
import WorkbenchProjectsPage from './pages/WorkbenchProjectsPage'
import WorkbenchConfigPage from './pages/WorkbenchConfigPage'
import WorkbenchLibraryPage from './pages/WorkbenchLibraryPage'
import WorkbenchRelationsPage from './pages/WorkbenchRelationsPage'
import WorkbenchOutlinePage from './pages/WorkbenchOutlinePage'
import WorkbenchWritePage from './pages/WorkbenchWritePage'
import WorkbenchNarrativePage from './pages/WorkbenchNarrativePage'
import WorkbenchAssistantPage from './pages/WorkbenchAssistantPage'
import WorkbenchSessionsPage from './pages/WorkbenchSessionsPage'
import { useAppStore } from './stores/appStore'

function AppRoutes() {
  const { hasFetchedCrushes, loading, fetchCrushes, needsOnboarding } = useAppStore()
  const location = useLocation()
  const isWorkbench = location.pathname.startsWith('/workbench')

  useEffect(() => {
    if (!hasFetchedCrushes && !loading) {
      fetchCrushes()
    }
  }, [fetchCrushes, hasFetchedCrushes, loading])

  if (!hasFetchedCrushes && !isWorkbench) {
    return (
      <Center h="100vh" bg="paper.100">
        <VStack spacing={3}>
          <Spinner size="xl" color="cinnabar.500" />
          <Text color="ink.600">正在加载角色与首次上手状态。</Text>
        </VStack>
      </Center>
    )
  }

  return (
    <Routes>
      <Route path="/workbench/*" element={<WorkbenchLayout />}>
        <Route index element={<WorkbenchHomePage />} />
        <Route path="projects" element={<WorkbenchProjectsPage />} />
        <Route path="config" element={<WorkbenchConfigPage />} />
        <Route path="characters" element={<WorkbenchLibraryPage mode="characters" />} />
        <Route path="worldview" element={<WorkbenchLibraryPage mode="worldview" />} />
        <Route path="organizations" element={<WorkbenchLibraryPage mode="organizations" />} />
        <Route path="materials" element={<WorkbenchLibraryPage mode="materials" />} />
        <Route path="relations" element={<WorkbenchRelationsPage />} />
        <Route path="outline" element={<WorkbenchOutlinePage />} />
        <Route path="write" element={<WorkbenchWritePage />} />
        <Route path="memory" element={<WorkbenchNarrativePage section="memory" />} />
        <Route path="foreshadow" element={<WorkbenchNarrativePage section="foreshadow" />} />
        <Route path="graph" element={<WorkbenchNarrativePage section="graph" />} />
        <Route path="skills" element={<WorkbenchNarrativePage section="skills" />} />
        <Route path="revisions" element={<WorkbenchNarrativePage section="revisions" />} />
        <Route path="assistant" element={<WorkbenchAssistantPage />} />
        <Route path="sessions" element={<WorkbenchSessionsPage />} />
        <Route path="*" element={<Navigate to="/workbench" replace />} />
      </Route>
      <Route
        path="*"
        element={
          <Layout>
            <Routes>
              <Route
                path="/"
                element={needsOnboarding() ? <Navigate to="/onboarding" replace /> : <DayPage />}
              />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/fragment" element={<FragmentPage />} />
              <Route path="/crush" element={<CrushPage />} />
              <Route path="/progress" element={<ProgressPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/update" element={<UpdatePage />} />
              <Route path="*" element={<Navigate to={needsOnboarding() ? '/onboarding' : '/'} replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
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
