/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  
  // Wyłącz React Strict Mode
  reactStrictMode: false,
  
  // Wyłącz SWC minifier który może powodować problemy
  swcMinify: false,
  
  // Webpack config dla bibliotek PDF
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Dodaj externals dla problemowych bibliotek po stronie serwera
      config.externals = config.externals || {};
      config.externals['canvas'] = 'canvas';
    }
    
    // Dodaj fallback dla node modules w browserze
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      canvas: false,
    };
    
    return config;
  },
  
  // Dodaj experimental flags dla lepszej stabilności
  experimental: {
    suppressHydrationWarning: true,
    serverComponentsExternalPackages: ['jspdf', 'jspdf-autotable'],
  },
  
  async redirects() {
    return [
      {
        source: '/',
        destination: '/login',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
