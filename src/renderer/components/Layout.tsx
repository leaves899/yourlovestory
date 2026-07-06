import React from 'react'
import { Box, Flex } from '@chakra-ui/react'
import Sidebar from './Sidebar'

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <Flex
      h="100vh"
      direction={{ base: 'column', md: 'row' }}
      bg="paper.200"
      backgroundImage="repeating-linear-gradient(90deg, rgba(59, 58, 53, 0.035) 0, rgba(59, 58, 53, 0.035) 1px, transparent 1px, transparent 64px), radial-gradient(circle at 78% 8%, rgba(95, 117, 69, 0.10), transparent 28%)"
    >
      <Sidebar />
      <Box
        flex={1}
        minH={0}
        overflowY="auto"
        pb={24}
        sx={{
          WebkitAppRegion: 'no-drag',
        }}
      >
        {children}
      </Box>
    </Flex>
  )
}

export default Layout
