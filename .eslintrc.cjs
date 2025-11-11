/**
 * ESLint Configuration
 * 
 * SINGLE-SOURCE: ändra bara i denna fil. Om du läser detta i en annan fil är det en bugg.
 */

module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    'no-redeclare': 'error',
    '@typescript-eslint/no-redeclare': 'error',
    'no-duplicate-imports': 'error',
  },
};

