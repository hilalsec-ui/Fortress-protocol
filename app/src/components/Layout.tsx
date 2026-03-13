import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletClientWrapper from './WalletClientWrapper';
import { Menu, X, Sun, Moon, Home, Zap, Clock, Calendar, CalendarDays, Trophy, Database, Heart, Info, Landmark, ShieldCheck, FileText } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();

  // Allow any child page to open the sidebar via custom event
  useEffect(() => {
    const handler = () => setIsMenuOpen(true);
    window.addEventListener('open-sidebar', handler);
    return () => window.removeEventListener('open-sidebar', handler);
  }, []);

  const navigation = [
    { name: 'Home',              href: '/',                  icon: Home,        activeColor: 'text-amber-400'  },
    { name: 'Lightning Pool',    href: '/lpm',               icon: Zap,         activeColor: 'text-yellow-400' },
    { name: 'Daily Pool',        href: '/dpl',               icon: Clock,       activeColor: 'text-sky-400'    },
    { name: 'Weekly Pool',       href: '/wpl',               icon: Calendar,    activeColor: 'text-violet-400' },
    { name: 'Monthly Pool',      href: '/mpl',               icon: CalendarDays,activeColor: 'text-orange-400' },
    { name: 'Participants Data', href: '/participants-data',  icon: Database,    activeColor: 'text-green-400'  },
    { name: 'Treasury',          href: '/treasury',          icon: Landmark,    activeColor: 'text-emerald-400'},
    { name: 'Provably Fair',     href: '/transparency',      icon: ShieldCheck, activeColor: 'text-cyan-400'   },
    { name: 'Whitepaper',        href: '/whitepaper',        icon: FileText,      activeColor: 'text-purple-400' },
  ];

  // Remove any duplicate 'Main' entry under Treasury or sidebar
  // (If there was a manual duplicate, it is now removed)

  return (
    <div className={`min-h-screen transition-all duration-700 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900' 
        : 'bg-gradient-to-br from-white via-blue-50 to-purple-50'
    }`}>
      {/* Theme Toggle Button */}
      <motion.button
        onClick={toggleTheme}
        className={`fixed right-2 sm:right-4 top-2 sm:top-4 z-50 p-2 sm:p-3 rounded-full shadow-lg transition-all duration-500 ${
          isDarkMode
            ? 'bg-yellow-400 hover:bg-yellow-300 text-gray-900'
            : 'bg-indigo-900 hover:bg-indigo-800 text-white'
        }`}
        whileHover={{ scale: 1.1, rotate: 180 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Toggle theme"
      >
        <AnimatePresence mode="wait">
          {isDarkMode ? (
            <motion.div
              key="sun"
              initial={{ rotate: -180, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 180, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Sun className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="moon"
              initial={{ rotate: -180, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 180, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Moon className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Hamburger Menu Button */}
      <button
        onClick={() => setIsMenuOpen(true)}
        className={`fixed left-2 sm:left-4 top-2 sm:top-4 z-50 p-2 sm:p-3 rounded-lg border transition-all duration-500 ${
          isDarkMode
            ? 'bg-black/50 backdrop-blur-md border-white/10 hover:bg-black/70 text-white'
            : 'bg-white/80 backdrop-blur-md border-gray-200 hover:bg-white shadow-lg text-gray-900'
        }`}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setIsMenuOpen(false)}
            />

            {/* Sidebar Menu */}
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed left-0 top-0 h-full w-72 sm:w-80 border-r z-50 shadow-2xl overflow-hidden flex flex-col ${
                isDarkMode
                  ? 'bg-black/80 backdrop-blur-md border-white/10'
                  : 'bg-white/95 backdrop-blur-md border-gray-200'
              }`}
            >
              <div className="p-4 flex-shrink-0">
                {/* Close Button */}
                <div className="flex items-center justify-end mb-3">
                  <button
                    onClick={() => setIsMenuOpen(false)}
                    className={`p-2 rounded-lg transition-all duration-300 ${
                      isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                    }`}
                    aria-label="Close menu"
                  >
                    <X className={`w-6 h-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`} />
                  </button>
                </div>
                
                {/* Try Your Luck Text */}
                <div className="mb-4 text-center">
                  <motion.h2
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-2xl sm:text-3xl font-black tracking-tight mb-1 flex items-center justify-center gap-2"
                    style={{ fontFamily: '"Poppins", "Inter", sans-serif' }}
                  >
                    {/* Red Coral Moonga gemstone icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width="1em"
                      height="1em"
                      className="inline-block flex-shrink-0"
                      aria-label="Carnelian Moonga"
                    >
                      <defs>
                        {/* Radial gradient gives carnelian its signature warm translucent glow */}
                        <radialGradient id="carnelianGlow" cx="42%" cy="32%" r="60%" gradientUnits="objectBoundingBox">
                          <stop offset="0%"   stopColor="#F5A882" />
                          <stop offset="30%"  stopColor="#D4561C" />
                          <stop offset="70%"  stopColor="#A03210" />
                          <stop offset="100%" stopColor="#5C1800" />
                        </radialGradient>
                      </defs>
                      {/* Main gem body — carnelian warm reddish-orange with inner glow */}
                      <polygon points="12,1 23,8 20,23 4,23 1,8" fill="url(#carnelianGlow)" />
                      {/* Facet overlays for cut-stone depth */}
                      {/* Crown table — bright peach catch-light */}
                      <polygon points="12,1 7,7 12,6 17,7" fill="rgba(255,195,150,0.38)" />
                      {/* Upper-left bezel — lighter */}
                      <polygon points="12,1 1,8 7,7" fill="rgba(255,160,100,0.18)" />
                      {/* Upper-right bezel — darker */}
                      <polygon points="12,1 23,8 17,7" fill="rgba(0,0,0,0.14)" />
                      {/* Lower-left pavilion — shadow */}
                      <polygon points="7,7 4,23 12,14" fill="rgba(0,0,0,0.22)" />
                      {/* Lower-right pavilion — deep shadow */}
                      <polygon points="17,7 20,23 12,14" fill="rgba(0,0,0,0.32)" />
                      {/* Centre pavilion — warm mid-tone */}
                      <polygon points="7,7 17,7 12,14" fill="rgba(255,110,50,0.12)" />
                      {/* Gem outline */}
                      <polygon points="12,1 23,8 20,23 4,23 1,8" fill="none" stroke="#5C1800" strokeWidth="0.55" />
                    </svg>
                    <span className={`${
                      isDarkMode
                        ? 'bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent'
                        : 'bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 bg-clip-text text-transparent'
                    }`}>
                      Try Your Luck
                    </span>
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`text-xs font-medium ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    Win Big on Solana
                  </motion.p>
                </div>
                
                {/* Wallet Connection at Top */}
                <div className="mb-3">
                  <WalletClientWrapper className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105" />
                </div>
              </div>

              {/* Navigation - Scrollable, closer to wallet */}
              <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent hover:scrollbar-thumb-white/30">
                {navigation.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMenuOpen(false)}
                      className={`group flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        isDarkMode
                          ? 'text-gray-300 hover:text-white hover:bg-white/10'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <div className={`p-2 rounded-lg transition-all ${
                        isDarkMode
                          ? 'bg-white/5 group-hover:bg-white/10'
                          : 'bg-gray-100 group-hover:bg-gray-200'
                      }`}>
                        <IconComponent className={`w-5 h-5 transition-colors ${
                          isActive
                            ? item.activeColor
                            : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`} />
                      </div>
                      <span className={`font-medium transition-colors ${
                        isActive ? (isDarkMode ? 'text-white' : 'text-gray-900') : ''
                      }`}>{item.name}</span>
                    </Link>
                  );
                })}
                
                {/* About Button */}
                <Link
                  href="/about"
                  onClick={() => setIsMenuOpen(false)}
                  className={`group flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 mt-4 ${
                    isDarkMode
                      ? 'text-gray-300 hover:text-white hover:bg-white/10'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <div className={`p-2 rounded-lg transition-all ${
                    isDarkMode
                      ? 'bg-white/5 group-hover:bg-white/10'
                      : 'bg-gray-100 group-hover:bg-gray-200'
                  }`}>
                    <Info className={`w-5 h-5 transition-colors ${
                      pathname === '/about' ? 'text-blue-400' : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`} />
                  </div>
                  <span className={`font-medium transition-colors ${
                    pathname === '/about' ? (isDarkMode ? 'text-white' : 'text-gray-900') : ''
                  }`}>About</span>
                </Link>
                
                {/* Donation Button */}
                <Link
                  href="/donate"
                  onClick={() => setIsMenuOpen(false)}
                  className={`group flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                    isDarkMode
                      ? 'text-gray-300 hover:text-white hover:bg-white/10'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <div className={`p-2 rounded-lg transition-all ${
                    isDarkMode
                      ? 'bg-white/5 group-hover:bg-white/10'
                      : 'bg-gray-100 group-hover:bg-gray-200'
                  }`}>
                    <Heart className={`w-5 h-5 transition-colors ${
                      pathname === '/donate' ? 'text-rose-400' : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`} />
                  </div>
                  <span className={`font-medium transition-colors ${
                    pathname === '/donate' ? (isDarkMode ? 'text-white' : 'text-gray-900') : ''
                  }`}>Donate</span>
                </Link>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="p-3 sm:p-6 md:p-8 pt-16 sm:pt-20">
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-7xl mx-auto"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
};

export default Layout;