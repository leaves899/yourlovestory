import React, { useEffect } from 'react'
import { Box, Select, Text, Spinner } from '@chakra-ui/react'
import { useAppStore } from '../stores/appStore'

/**
 * 全局角色选择器 —— 嵌入侧边栏或页面顶部。
 * 下拉列出所有角色，切换时更新全局 activeSlug。
 */
function CharacterSelector() {
  const { activeSlug, crushes, loading, fetchCrushes, setActiveSlug } = useAppStore()

  // 加载角色列表（只加载一次）
  useEffect(() => {
    if (crushes.length === 0) {
      fetchCrushes()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 过滤掉 TEMPLATE（模板不应出现在选择器中）
  const realCrushes = crushes.filter((c) => c.slug !== 'TEMPLATE')

  if (loading) {
    return (
      <Box py={2}>
        <Spinner size="sm" />
      </Box>
    )
  }

  if (realCrushes.length === 0) {
    return (
      <Box py={2}>
        <Text fontSize="sm" color="gray.500">
          还没有角色
        </Text>
      </Box>
    )
  }

  return (
    <Box py={2}>
      <Select
        size="sm"
        value={activeSlug ?? ''}
        onChange={(e) => setActiveSlug(e.target.value)}
        bg="white"
        borderRadius="md"
      >
        {realCrushes.map((crush) => (
          <option key={crush.slug} value={crush.slug}>
            {crush.name} ({crush.nickname})
          </option>
        ))}
      </Select>
    </Box>
  )
}

export default CharacterSelector
