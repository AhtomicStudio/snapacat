module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  moduleNameMapper: {
    // Generated sprite sheets are require()d by src/assets/sprites/index.ts.
    '\\.(png|jpg|jpeg|gif|webp)$': '<rootDir>/scripts/jest/assetStub.js',
  },
  modulePathIgnorePatterns: ['node_modules', '<rootDir>/android', '<rootDir>/ios'],
};
