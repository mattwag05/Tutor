import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'tests/api-resolve-base.test.ts',
      'tests/composer-keyboard.test.ts',
      'tests/doc-attachments.test.ts',
      'tests/knowledge-helpers.test.ts',
      'tests/latex.test.ts',
      'tests/markdown-display.test.ts',
      'tests/math-animator-types.test.ts',
      'tests/message-content.test.ts',
      'tests/quiz-question-type.test.ts',
      'tests/skill-slug.test.ts',
      'tests/think-segments.test.ts',
      'tests/version.test.ts',
    ],
    setupFiles: ['tests/setup-env.ts'],
  },
});
