/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  // 支持 @/* 别名（与 tsconfig paths 对齐），让测试能 import src/shared
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  coverageThreshold: {
    global: {
      lines: 70,
      statements: 65,
      branches: 50,
      functions: 60,
    },
  },
  testTimeout: 15000,
}
