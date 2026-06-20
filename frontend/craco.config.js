// craco.config.js
const path = require("path");
require("dotenv").config();

// Check if we're in development/preview mode (not production build)
// Craco sets NODE_ENV=development for start, NODE_ENV=production for build
const isDevServer = process.env.NODE_ENV !== "production";

// Environment variable overrides
const config = {
  enableHealthCheck: process.env.ENABLE_HEALTH_CHECK === "true",
};

// Conditionally load health check modules only if enabled
let WebpackHealthPlugin;
let setupHealthEndpoints;
let healthPluginInstance;

if (config.enableHealthCheck) {
  WebpackHealthPlugin = require("./plugins/health-check/webpack-health-plugin");
  setupHealthEndpoints = require("./plugins/health-check/health-endpoints");
  healthPluginInstance = new WebpackHealthPlugin();
}

let webpackConfig = {
  eslint: {
    configure: {
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {

      // Add ignored patterns to reduce watched directories
        webpackConfig.watchOptions = {
          ...webpackConfig.watchOptions,
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/build/**',
            '**/dist/**',
            '**/coverage/**',
            '**/public/**',
        ],
      };

      // Add health check plugin to webpack if enabled
      if (config.enableHealthCheck && healthPluginInstance) {
        webpackConfig.plugins.push(healthPluginInstance);
      }
      
      // Fix for devServer configuration if present
      if (webpackConfig.devServer) {
        // Remove deprecated options
        delete webpackConfig.devServer.onBeforeSetupMiddleware;
        delete webpackConfig.devServer.onAfterSetupMiddleware;
        
        // Fix https option
        if (webpackConfig.devServer.https) {
          webpackConfig.devServer.server = {
            type: 'https',
            options: webpackConfig.devServer.https === true ? {} : webpackConfig.devServer.https
          };
          delete webpackConfig.devServer.https;
        }
      }
      
      return webpackConfig;
    },
  },
};

if (isDevServer) {
  webpackConfig.devServer = (devServerConfig) => {
    const fs = require('fs');
    const paths = require('react-scripts/config/paths');
    const evalSourceMapMiddleware = require('react-scripts/config/webpackDevServer.config').evalSourceMapMiddleware ||
      require('react-dev-utils/evalSourceMapMiddleware');
    const redirectServedPath = require('react-dev-utils/redirectServedPathMiddleware');
    const noopServiceWorkerMiddleware = require('react-dev-utils/noopServiceWorkerMiddleware');

    // Remove deprecated options
    delete devServerConfig.onBeforeSetupMiddleware;
    delete devServerConfig.onAfterSetupMiddleware;

    // Fix https option - devServer.https was deprecated, remove it entirely for now
    // In a production environment, configure HTTPS at the reverse proxy level
    delete devServerConfig.https;

    // Use setupMiddlewares instead
    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      // This lets us fetch source contents from webpack for the error overlay
      if (evalSourceMapMiddleware) {
        devServer.app.use(evalSourceMapMiddleware(devServer));
      }

      if (fs.existsSync(paths.proxySetup)) {
        // This registers user provided middleware for proxy reasons
        require(paths.proxySetup)(devServer.app);
      }

      // Add health check endpoints if enabled
      if (config.enableHealthCheck && setupHealthEndpoints && healthPluginInstance) {
        setupHealthEndpoints(devServer, healthPluginInstance);
      }

      // Redirect to `PUBLIC_URL` or `homepage` from `package.json` if url not match
      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));

      // This service worker file is effectively a 'no-op'
      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));

      return middlewares;
    };

    return devServerConfig;
  };
}

// Wrap with visual edits (automatically adds babel plugin, dev server, and overlay in dev mode)
// Temporarily disabled to avoid webpack-dev-server v5 compatibility issues
/* if (isDevServer) {
  try {
    const { withVisualEdits } = require("@emergentbase/visual-edits/craco");
    webpackConfig = withVisualEdits(webpackConfig);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('@emergentbase/visual-edits/craco')) {
      console.warn(
        "[visual-edits] @emergentbase/visual-edits not installed — visual editing disabled."
      );
    } else {
      throw err;
    }
  }
} */

module.exports = webpackConfig;
