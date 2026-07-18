import {
  Badge,
  Box,
  HStack,
  Stack,
  Link,
  Text,
  Icon,
  type BoxProps,
} from '@chakra-ui/react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { FaBook, FaStickyNote, FaUser, FaHeart, FaCog, FaQuestionCircle, FaSync, FaRobot, FaFeatherAlt } from 'react-icons/fa'
import CharacterSelector from './CharacterSelector'
import { useAppStore } from '../stores/appStore'

const navItems = [
  { path: '/workbench', label: '长篇工作台', icon: FaFeatherAlt },
  { path: '/assistant', label: 'Agent 助手', icon: FaRobot },
  { path: '/', label: '日常写作', icon: FaBook },
  { path: '/fragment', label: '碎片日记', icon: FaStickyNote },
  { path: '/crush', label: '角色管理', icon: FaUser },
  { path: '/progress', label: '关系进度', icon: FaHeart },
  { path: '/settings', label: '设置', icon: FaCog },
  { path: '/help', label: '帮助', icon: FaQuestionCircle },
  { path: '/update', label: '更新', icon: FaSync },
]

const sidebarStyles: BoxProps = {
  w: { base: '100%', md: '292px' },
  bg: 'rgba(234, 223, 206, 0.86)',
  borderRight: { base: '0', md: '1px solid' },
  borderBottom: { base: '1px solid', md: '0' },
  borderColor: 'ink.300',
  boxShadow: '14px 0 36px rgba(55, 48, 38, 0.10)',
}

function Sidebar() {
  const location = useLocation()
  const { needsOnboarding } = useAppStore()
  const visibleNavItems = needsOnboarding()
    ? navItems.filter((item) => item.path !== '/update')
    : navItems

  return (
    <Box
      p={4}
      position="relative"
      overflow="hidden"
      flexShrink={0}
      sx={{
        WebkitAppRegion: 'no-drag',
      }}
      {...sidebarStyles}
    >
      <Box
        position="absolute"
        inset={0}
        pointerEvents="none"
        opacity={0.45}
        backgroundImage="radial-gradient(circle at 20% 14%, rgba(27, 29, 26, 0.10), transparent 18%), repeating-linear-gradient(0deg, transparent 0, transparent 30px, rgba(59, 58, 53, 0.035) 31px)"
      />
      <Box position="relative">
        <HStack align="center" spacing={3} mb={2}>
          <Box
            w="22px"
            h="22px"
            borderRadius="4px"
            bg="cinnabar.500"
            boxShadow="0 8px 22px rgba(159, 70, 53, 0.26)"
          />
          <Box>
            <Text fontSize="xl" fontWeight="bold" data-testid="app-title">
              yourcrush
            </Text>
            <Text fontSize="xs" color="ink.500">
              章节
            </Text>
          </Box>
        </HStack>
        {needsOnboarding() && (
          <Badge colorScheme="cinnabar" mb={3}>
            首次上手中
          </Badge>
        )}
        <CharacterSelector />
        <Stack
          direction={{ base: 'row', md: 'column' }}
          align={{ base: 'center', md: 'stretch' }}
          spacing={1.5}
          mt={{ base: 3, md: 5 }}
          pb={{ base: 1, md: 0 }}
          overflowX={{ base: 'auto', md: 'visible' }}
          position="relative"
        >
          {visibleNavItems.map((item, index) => {
            const active = location.pathname === item.path

            return (
              <Link
                key={item.path}
                as={RouterLink}
                to={item.path}
                bg={active ? 'paper.50' : 'transparent'}
                borderLeftColor={{ base: 'transparent', md: active ? 'cinnabar.500' : 'transparent' }}
                borderBottomColor={{ base: active ? 'cinnabar.500' : 'transparent', md: 'transparent' }}
                color={active ? 'ink.900' : 'ink.600'}
                boxShadow={active ? 'inkLine' : 'none'}
                _hover={{ bg: 'rgba(255, 252, 244, 0.68)', color: 'ink.900' }}
                display="flex"
                alignItems="center"
                gap={3}
                textDecoration="none"
                position="relative"
                flexShrink={0}
                borderLeft={{ base: '0', md: '3px solid' }}
                borderBottom={{ base: '3px solid', md: '0' }}
                borderRadius="4px"
                px={4}
                py={3}
                data-testid={`nav-${item.path === '/' ? 'day' : item.path.slice(1)}`}
              >
                <Text fontSize="xs" color="cinnabar.600" minW="24px">
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Box
                  w="24px"
                  h="24px"
                  borderRadius="6px"
                  display="grid"
                  placeItems="center"
                  bg={active ? 'cinnabar.500' : 'ink.100'}
                  color={active ? 'paper.50' : 'ink.600'}
                  flexShrink={0}
                >
                  <Icon as={item.icon} boxSize={3.5} />
                </Box>
                <Text>{item.label}</Text>
              </Link>
            )
          })}
        </Stack>
        <Box
          mt={6}
          pt={4}
          borderTop="1px solid"
          borderColor="ink.200"
          color="ink.500"
          display={{ base: 'none', md: 'block' }}
        >
          <Text fontSize="xs">本地手稿</Text>
          <Text fontSize="xs" mt={1}>
            角色、碎片和 Day 都保存在这台设备。
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

export default Sidebar
