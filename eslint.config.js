import globals from 'globals';

// The site ships as classic <script> tags that share one global scope, so
// no-undef must know every cross-file name (see the <script> order in index.html).
const crossFile = Object.fromEntries([
  // js/translations.js, arabic_utils.js, tag_generator.js, wikidata_labels.js, tools.js
  'TRANSLATIONS', 'ArabicUtils', 'TagGenerator', 'WikidataLabels', 'MappingTools', 'escapeHtml', 'safeUrl',
  // js/osm_oauth.js, wikidata_auth.js, wikidata_edit.js, live_verify.js
  'OsmAuth', 'ImportAccess', 'WikidataAuth', 'WikidataEdit', 'LiveVerifier',
  // js/batch_manager.js, history_manager.js, map.js
  'BatchManager', 'HistoryManager', 'MapController',
  // js/modal_a11y.js
  'ModalA11y',
  // js/app.js state and helpers used by the files loaded before it
  'currentLang', 'currentCountry', 'currentMode', 'loadedDataset', 'loadedReverseDataset',
  'selectedItem', 'applyFilters', 'selectItem', 'updateDatasetItemStatus', 'refreshViewAfterPush',
  'renderSummaryStats', 'setLanguage', 'updateAuthUI',
].map((name) => [name, 'readonly']));

export default [
  { ignores: ['vendor/**', 'node_modules/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, L: 'readonly', ...crossFile },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['eslint.config.js', 'playwright.config.js', 'vitest.config.js', 'tests/js/**/*.js', 'e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
];
