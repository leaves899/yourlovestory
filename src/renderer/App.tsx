import { lazy, Suspense, useEffect } from 'react'
import { Box, Center, Spinner, Text, VStack } from '@chakra-ui/react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAppStore } from './stores/appStore'

const Layout = lazy(() => import('./components/Layout'))
const WorkbenchLayout = lazy(() => import('./components/WorkbenchLayout'))
const DayPage = lazy(() => import('./pages/DayPage'))
const FragmentPage = lazy(() => import('./pages/FragmentPage'))
const CrushPage = lazy(() => import('./pages/CrushPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const UpdatePage = lazy(() => import('./pages/UpdatePage'))
const ProgressPage = lazy(() => import('./pages/ProgressPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const AssistantPage = lazy(() => import('./pages/AssistantPage'))
const WorkbenchHomePage = lazy(() => import('./pages/WorkbenchHomePage'))
const WorkbenchProjectsPage = lazy(() => import('./pages/WorkbenchProjectsPage'))
const WorkbenchConfigPage = lazy(() => import('./pages/WorkbenchConfigPage'))
const WorkbenchLibraryPage = lazy(() => import('./pages/WorkbenchLibraryPage'))
const WorkbenchRelationsPage = lazy(() => import('./pages/WorkbenchRelationsPage'))
const WorkbenchOutlinePage = lazy(() => import('./pages/WorkbenchOutlinePage'))
const WorkbenchWritePage = lazy(() => import('./pages/WorkbenchWritePage'))
const FirstChapterWizardPage = lazy(() => import('./pages/FirstChapterWizardPage'))
const WorkbenchReviewPage = lazy(() => import('./pages/WorkbenchReviewPage'))
const WorkbenchNarrativePage = lazy(() => import('./pages/WorkbenchNarrativePage'))
const WorkbenchAssistantPage = lazy(() => import('./pages/WorkbenchAssistantPage'))
const WorkbenchSessionsPage = lazy(() => import('./pages/WorkbenchSessionsPage'))

function RouteFallback() {
  return (
    <Center h="100vh" bg="paper.100">
      <VStack spacing={3}>
        <Spinner size="xl" color="cinnabar.500" />
        <Text color="ink.600">正在加载工作区。</Text>
      </VStack>
    </Center>
  )
}

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
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="first-chapter" element={<FirstChapterWizardPage />} />
        <Route path="review" element={<WorkbenchReviewPage />} />
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
                element={<Navigate to="/workbench" replace />}
              />
              <Route
                path="/journal"
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
    </Suspense>
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
