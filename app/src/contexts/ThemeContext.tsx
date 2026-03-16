"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeContextType = {
  isDarkMode: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [mounted, setMounted] = useState(false);

  // On first render, apply dark mode immediately (before hydration)
  useEffect(() => {
    // Check if we have a saved preference
    const savedTheme = localStorage.getItem('theme');
    let darkMode = true; // Default to dark mode
    
    if (savedTheme === 'light') {
      darkMode = false;
    }
    
    setIsDarkMode(darkMode);
    
    // Apply dark class to html element immediately
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    
    setMounted(true);
  }, []);

  // Save theme preference and apply to DOM
  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    localStorage.setItem('theme', newMode ? 'dark' : 'light');
    
    // Apply dark class to html element
    if (newMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  };

  // Emit the dark class as soon as possible
  if (typeof window !== 'undefined' && !mounted) {
    // Apply dark mode class synchronously on first load
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }

  return (
    <>
      {/* Prevent flash of light mode by applying dark mode inline styles */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            try {
              const theme = localStorage.getItem('theme');
              const isDark = theme !== 'light';
              if (isDark) {
                document.documentElement.classList.add('dark');
                document.documentElement.style.colorScheme = 'dark';
              } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.style.colorScheme = 'light';
              }
            } catch (e) {}
          `,
        }}
      />
      <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>
        {children}
      </ThemeContext.Provider>
    </>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Return dark mode as default for SSR
    return { isDarkMode: true, toggleTheme: () => {} };
  }
  return context;
}
