const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  
  return {
    mode: argv.mode || 'production',
    devtool: isDev ? 'inline-source-map' : false,
    
    entry: {
      background: './src/background.js',
      content: './src/content.js',
      popup: './src/popup.js'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),  // ← Output in dist/
      filename: '[name].js',
      clean: true  // Pulisce dist/ ad ogni build
    },
    
    optimization: {
      minimize: !isDev  // Solo production minifica
    },
    
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/manifest.json', to: 'manifest.json' },
          { from: 'public/popup.html', to: 'popup.html' },
          { from: 'public/icons', to: 'icons', noErrorOnMissing: true }
        ]
      })
    ],
    
    resolve: {
      fallback: {
        "buffer": false,
        "stream": false,
        "path": false
      }
    }
  };
};
