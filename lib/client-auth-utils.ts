// lib/client-auth-utils.ts
// Funkcje pomocnicze dla komponentów klienckich (bez importowania pg)

export const hasRole = (session: any, allowedRoles: string[]): boolean => {
  return session?.user?.role && allowedRoles.includes(session.user.role);
};

export const isHandlowiec = (session: any): boolean => {
  return session?.user?.role === 'handlowiec';
};

export const isZarzad = (session: any): boolean => {
  return session?.user?.role === 'zarząd';
};

export const canAccessAllData = (session: any): boolean => {
  // Zarząd i centrum elektryczne mogą widzieć dane wszystkich
  return ['zarząd', 'centrum elektryczne'].includes(session?.user?.role);
};

export const getMarketRegion = (session: any): string | null => {
  return session?.user?.marketRegion || null;
};

export const getUserRole = (session: any): string => {
  return session?.user?.role || 'inne';
};

export const canManageUsers = (session: any): boolean => {
  return session?.user?.role === 'zarząd';
};

export const getRoleDisplayName = (role: string): string => {
  const roleMap: Record<string, string> = {
    'handlowiec': 'Handlowiec',
    'zarząd': 'Zarząd',
    'centrum elektryczne': 'Centrum Elektryczne',
    'budowy': 'Budowy',
    'inne': 'Inne'
  };
  return roleMap[role] || role;
};

export const getRoleBadgeColor = (role: string): string => {
  const colorMap: Record<string, string> = {
    'handlowiec': 'bg-blue-100 text-blue-800',
    'zarząd': 'bg-purple-100 text-purple-800',
    'centrum elektryczne': 'bg-green-100 text-green-800',
    'budowy': 'bg-orange-100 text-orange-800',
    'inne': 'bg-gray-100 text-gray-800'
  };
  return colorMap[role] || 'bg-gray-100 text-gray-800';
};

// Debug helper (tylko dla development)
export const debugSession = (session: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🐛 Session debug:', {
      userId: session?.user?.id,
      email: session?.user?.email,
      role: session?.user?.role,
      marketRegion: session?.user?.marketRegion
    });
  }
};
