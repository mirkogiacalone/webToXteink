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
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    
    optimization: {
      minimize: !isDev
    },
    
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'public/manifest.json', to: 'manifest.json' },
          { from: 'public/popup.html', to: 'popup.html' },
          { from: 'public/icon-v2-16.png', to: 'icon-v2-16.png' },
          { from: 'public/icon-v2-48.png', to: 'icon-v2-48.png' },
          { from: 'public/icon-v2-128.png', to: 'icon-v2-128.png' }
        ]
      })
    ],
    
    resolve: {
      fallback: {
        'buffer': false,
        'stream': false,
        'path': false
      }
    }
  };
};