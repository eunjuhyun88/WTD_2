// W-A108: minimal stylelint — font-size < 11px gate for hubs/ only
// Extends nothing — prevents 2000+ standard rule violations on existing code.
// Phase 1 (W-A108): enforce 7/8/9/10px ban in hubs/
// Phase 2 (W-0389): extend to full src/ after font normalization
/** @type {import('stylelint').Config} */
module.exports = {
  rules: {
    // Block font sizes below Bloomberg minimum (W-0381 token: --ui-text-xs = 11px)
    'declaration-property-value-disallowed-list': {
      'font-size': ['/^[78]px$/', '/^9px$/', '/^10px$/'],
    },
  },
  overrides: [
    {
      files: ['**/*.svelte'],
      customSyntax: 'postcss-html',
    },
  ],
};
