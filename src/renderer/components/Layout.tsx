import React from 'react'
import { Box, Flex } from '@chakra-ui/react'
import Sidebar from './Sidebar'

interface LayoutProps {
  children: React.ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <Flex h="100vh">
      <Sidebar />
      <Box flex={1} p={4} overflowY="auto">
        {children}
      </Box>
    </Flex>
  )
}

export default Layout
