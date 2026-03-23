import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CalendarCheck, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Globe,
  User as UserIcon
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { Logo } from './Logo';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile, signOut, isAdmin } = useAuth();
  const { t, language, setLanguage, isRtl } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const navigation = [
    { name: t('nav.dashboard'), href: '/', icon: LayoutDashboard },
    ...(isAdmin ? [
      { name: t('nav.employees'), href: '/employees', icon: Users },
      { name: t('nav.attendance'), href: '/attendance', icon: CalendarCheck },
      { name: t('nav.settings'), href: '/settings', icon: Settings },
    ] : []),
  ];

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className={cn("min-h-screen bg-gray-50 flex", isRtl ? "font-arabic" : "font-sans")}>
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        isRtl ? (isSidebarOpen ? "translate-x-0 right-0" : "translate-x-full right-0") : (isSidebarOpen ? "translate-x-0 left-0" : "-translate-x-full left-0")
      )}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Logo className="h-12 w-auto" />
              <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <h1 className="text-sm font-bold text-gray-800 leading-tight">{t('app.title')}</h1>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                    isActive 
                      ? "bg-blue-50 text-blue-600" 
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isRtl ? "ml-3" : "mr-3")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center p-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <UserIcon className="w-6 h-6" />
              </div>
              <div className={cn("flex-1 min-w-0", isRtl ? "mr-3" : "ml-3")}>
                <p className="text-sm font-medium text-gray-900 truncate">{userProfile?.name}</p>
                <p className="text-xs text-gray-500 truncate">{userProfile?.role === 'hr-admin' ? 'HR Admin' : userProfile?.position}</p>
              </div>
            </div>
            
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                <Globe className="w-4 h-4" />
                {language === 'en' ? 'العربية' : 'English'}
              </button>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 lg:hidden">
          <div className="px-4 h-16 flex items-center justify-between">
            <button onClick={() => setIsSidebarOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <Logo className="h-8 w-auto" />
            <div className="w-6" /> {/* Spacer */}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
