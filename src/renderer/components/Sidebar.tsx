import React from 'react'
import { Box, VStack, Link, Text, Icon } from '@chakra-ui/react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { FaBook, FaStickyNote, FaUser, FaHeart, FaCog, FaQuestionCircle, FaSync } from 'react-icons/fa'
import CharacterSelector from './CharacterSelector'

const navItems = [
  { path: '/', label: '日常写作', icon: FaBook },
  { path: '/fragment', label: '碎片日记', icon: FaStickyNote },
  { path: '/crush', label: '角色管理', icon: FaUser },
  { path: '/progress', label: '关系进度', icon: FaHeart },
  { path: '/settings', label: '设置', icon: FaCog },
  { path: '/help', label: '帮助', icon: FaQuestionCircle },
  { path: '/update', label: '更新', icon: FaSync },
]

function Sidebar() {
  const location = useLocation()

  return (
    <Box w="250px" bg="gray.100" p={4} borderRight="1px" borderColor="gray.200">
      <Text fontSize="xl" fontWeight="bold" mb={2}>
        yourcrush
      </Text>
      <CharacterSelector />
      <VStack align="stretch" spacing={2} mt={4}>
        {navItems.map((item) => (
          <Link
            key={item.path}
            as={RouterLink}
            to={item.path}
            p={3}
            borderRadius="md"
            bg={location.pathname === item.path ? 'blue.100' : 'transparent'}
            _hover={{ bg: 'blue.50' }}
            display="flex"
            alignItems="center"
            gap={3}
          >
            <Icon as={item.icon} />
            <Text>{item.label}</Text>
          </Link>
        ))}
      </VStack>
    </Box>
  )
}

export default Sidebar
