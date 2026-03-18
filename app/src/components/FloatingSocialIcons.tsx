'use client';

import { motion } from 'framer-motion';
import { FaXTwitter, FaTelegram } from 'react-icons/fa6';
import { useTheme } from '@/contexts/ThemeContext';

export const FloatingSocialIcons: React.FC = () => {
  const { isDarkMode } = useTheme();

  const socialLinks = [
    {
      icon: FaXTwitter,
      url: 'https://x.com/fptpool',
      label: 'Follow on X',
      color: 'hover:text-black dark:hover:text-white',
      bgColor: isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'
    },
    {
      icon: FaTelegram,
      url: 'https://t.me/fptpool',
      label: 'Join Telegram',
      color: 'hover:text-blue-500',
      bgColor: isDarkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-slate-100 hover:bg-slate-200'
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 12,
      },
    },
  };

  return (
    <motion.div
      className="fixed bottom-8 right-8 z-40 flex flex-col gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {socialLinks.map((social, index) => {
        const Icon = social.icon;
        return (
          <motion.a
            key={index}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            title={social.label}
            className={`flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300 ${social.bgColor} ${social.color}`}
            variants={itemVariants}
            whileHover={{
              scale: 1.15,
              boxShadow: isDarkMode
                ? '0 20px 40px rgba(99, 102, 241, 0.4)'
                : '0 20px 40px rgba(99, 102, 241, 0.3)',
            }}
            whileTap={{ scale: 0.95 }}
          >
            <Icon size={24} />
          </motion.a>
        );
      })}
    </motion.div>
  );
};
