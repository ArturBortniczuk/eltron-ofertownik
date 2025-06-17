/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  
  reactStrictMode: false,
  
  experimental: {
    webpackBuildWorker: false, // Wyłącz na czas buildu
  },
  
  webpack: (config, { isServer, webpack }) => {
    // Napraw problemy z pg i cloudflare
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(cloudflare:sockets|pg-cloudflare)$/,
      })
    );

    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        encoding: false,
        'pg-native': false,
        'pg-cloudflare': false,
        'cloudflare:sockets': false,
      };
      
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
        'cloudflare:sockets': false,
      };
    }
    
    // Ignoruj problematyczne moduły
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push('pg-native');
      config.externals.push('cloudflare:sockets');
      config.externals.push('pg-cloudflare');
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
