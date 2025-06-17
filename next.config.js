/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  
  reactStrictMode: false,
  
  experimental: {
    webpackBuildWorker: true,
  },
  
  webpack: (config, { isServer }) => {
    // Fix dla pg i cloudflare
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        encoding: false,
        // Dodaj aliasy dla problemów z pg
        'pg-native': false,
        'pg-cloudflare': false,
        'cloudflare:sockets': false,
      };
      
      // Zignoruj moduły które powodują problemy
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
    }
    
    // Zignoruj problematyczne importy
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('pg-native');
    }
    
    return config;
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
