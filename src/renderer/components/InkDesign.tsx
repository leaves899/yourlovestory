import {
  Box,
  HStack,
  Heading,
  Stack,
  Text,
  type BoxProps,
  type StackProps,
} from '@chakra-ui/react'
import type { ReactNode } from 'react'

interface InkPageProps extends Omit<StackProps, 'title'> {
  title: string
  subtitle?: string
  eyebrow?: string
  action?: ReactNode
  titleTestId?: string
}

export function InkPage({
  title,
  subtitle,
  eyebrow,
  action,
  titleTestId,
  children,
  ...props
}: InkPageProps) {
  return (
    <Box
      maxW="1040px"
      mx="auto"
      px={{ base: 4, md: 7 }}
      py={{ base: 5, md: 7 }}
      borderLeft={{ base: '0', md: '1px solid' }}
      borderColor="ink.200"
      position="relative"
      {...props}
    >
      <Box
        mb={6}
        p={{ base: 4, md: 5 }}
        bg="rgba(255, 252, 244, 0.72)"
        border="1px solid"
        borderColor="ink.200"
        borderRadius="8px"
        boxShadow="inkPanel"
        position="relative"
        overflow="hidden"
        _before={{
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          bg: 'cinnabar.500',
          pointerEvents: 'none',
        }}
        _after={{
          content: '""',
          position: 'absolute',
          right: 4,
          bottom: 4,
          width: '72px',
          height: '72px',
          borderRadius: '999px',
          border: '1px solid',
          borderColor: 'cinnabar.200',
          opacity: 0.26,
          pointerEvents: 'none',
        }}
      >
        <HStack
          justify="space-between"
          align={{ base: 'flex-start', md: 'center' }}
          spacing={5}
          flexWrap="wrap"
          position="relative"
          zIndex={1}
        >
          <Box>
            {eyebrow && (
              <Text
                color="cinnabar.600"
                fontSize="xs"
                fontWeight="semibold"
                mb={2}
              >
                {eyebrow}
              </Text>
            )}
            <Heading size="lg" data-testid={titleTestId}>
              {title}
            </Heading>
            {subtitle && (
              <Text mt={3} color="ink.600" maxW="680px">
                {subtitle}
              </Text>
            )}
          </Box>
          {action && <Box flexShrink={0}>{action}</Box>}
        </HStack>
      </Box>
      <Stack spacing={5}>{children}</Stack>
    </Box>
  )
}

export function InkPanel({ children, ...props }: BoxProps) {
  return (
    <Box
      p={{ base: 4, md: 5 }}
      bg="paper.50"
      border="1px solid"
      borderColor="ink.300"
      borderRadius="6px"
      boxShadow="inkSheet"
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '3px',
        bg: 'ink.300',
        opacity: 0.7,
        pointerEvents: 'none',
      }}
      {...props}
    >
      {children}
    </Box>
  )
}
