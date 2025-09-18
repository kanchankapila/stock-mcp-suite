import { defineConfig } from 'vite';
import { resolve } from 'path';
import legacy from '@vitejs/plugin-legacy';
import { VitePWA } from 'vite-plugin-pwa';
import WindiCSS from 'vite-plugin-windicss';

export default defineConfig({
  // Base configuration
  base: './',
  publicDir: 'public',
  
  // Development server
  server: {
    port: 4200,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4010',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: 'ws://localhost:4010',
        ws: true,
        changeOrigin: true
      }
    }
  },
  
  // Build optimizations
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: true,
    outDir: 'dist',
    assetsDir: 'assets',
    
    // Chunk splitting for better caching
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html')
      },
      output: {
        manualChunks: {
          // Vendor chunks for better caching
          'chart-libs': ['chart.js', 'd3', 'apexcharts', 'plotly.js-dist'],
          'utils': ['lodash-es', 'date-fns', 'numeral'],
          'animations': ['framer-motion', 'gsap', 'lottie-web'],
          'angular': ['@angular/core', '@angular/common', '@angular/platform-browser']
        },
        
        // Asset naming for better caching
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.');
          const ext = info?.[info.length - 1];
          
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext || '')) {
            return 'assets/images/[name]-[hash][extname]';
          }
          
          if (/css/i.test(ext || '')) {
            return 'assets/css/[name]-[hash][extname]';
          }
          
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    
    // Terser options for better minification
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        safari10: true
      },
      format: {
        safari10: true
      }
    }
  },
  
  // Plugins
  plugins: [
    // WindiCSS for utility-first CSS
    WindiCSS(),
    
    // Legacy browser support
    legacy({
      targets: ['defaults', 'not IE 11']
    }),
    
    // Progressive Web App
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Stock Analytics Hub',
        short_name: 'StockHub',
        description: 'AI-powered stock analytics platform with advanced visualizations',
        theme_color: '#3b82f6',
        background_color: '#0f172a',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  
  // Dependencies optimization
  optimizeDeps: {
    include: [
      'chart.js',
      'd3',
      'apexcharts',
      'lodash-es',
      'date-fns',
      'numeral'
    ],
    exclude: [
      'plotly.js-dist' // Large library, load on demand
    ]
  },
  
  // CSS preprocessing
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@import "./src/styles/variables.scss";`
      }
    },
    modules: {
      localsConvention: 'camelCase'
    }
  },
  
  // Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development')
  },
  
  // Path resolution
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@services': resolve(__dirname, 'src/services'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@types': resolve(__dirname, 'src/types'),
      '@styles': resolve(__dirname, 'src/styles')
    }
  },
  
  // Preview configuration
  preview: {
    port: 4173,
    host: true
  }
});