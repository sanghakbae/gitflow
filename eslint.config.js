import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // 실제로 겪은 결함들을 규칙으로 고정한다
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          // <a href="/..."> 는 SPA 에서 전체 새로고침을 일으킨다. Link 를 쓴다.
          selector:
            'JSXOpeningElement[name.name="a"] > JSXAttribute[name.name="href"] > Literal[value=/^[/?#]/]',
          message: '내부 이동은 <a href> 대신 react-router 의 <Link> 를 쓰세요 (전체 새로고침 방지).',
        },
        {
          // 인증 상태를 IndexedDB 에 두면 백그라운드 탭에서 로그인이 끊긴다
          selector: 'ImportSpecifier[imported.name="indexedDBLocalPersistence"]',
          message: 'indexedDBLocalPersistence 는 hidden 탭에서 실패합니다. browserLocalPersistence 를 쓰세요.',
        },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
    },
  },

  {
    // 테스트는 vitest 전역을 쓴다
    files: ['**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-restricted-syntax': 'off' },
  },
]
