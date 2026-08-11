const config = {
  plugins: {
    "@tailwindcss/postcss": {
      // Disable the native Oxide engine to avoid Windows compatibility issues
      // during GitHub Actions builds. Falls back to the JS-only engine.
      oxide: false,
    },
  },
};

export default config;
