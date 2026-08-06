import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Google AI Studio / Canvas 注入的全域變數。在 Vite build 裡是 undefined，
        // 但程式碼必須保留（appId 由它推導出來，見 src/lib/firebase.js）。
        __app_id: 'readonly',
        __initial_auth_token: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // api/ 是 Vercel 的 Node serverless functions，不是瀏覽器環境
    files: ['api/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
])
