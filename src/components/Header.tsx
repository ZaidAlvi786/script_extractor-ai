"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { LogOut, Settings, LayoutDashboard, PenLine, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
  user: User | null;
}

export default function Header({ user }: HeaderProps) {
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="glass fixed top-0 left-0 right-0 z-50 h-20 flex items-center justify-between px-6 md:px-12" suppressHydrationWarning>
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20" suppressHydrationWarning>
          <span className="text-black font-bold text-xl">C</span>
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          CreatorAI Engine
        </h1>
      </Link>
      
      <nav className="hidden md:flex items-center gap-8">
        <a href="#" className="text-gray-400 hover:text-white transition-colors">Features</a>
        <a href="#" className="text-gray-400 hover:text-white transition-colors">Pricing</a>
        <Link href="/analyze" className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-medium">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          Analyze
        </Link>
        <Link href="/script-writer" className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors font-medium">
          <PenLine className="w-4 h-4" />
          Script Writer
        </Link>
        
        {user ? (
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 pl-1 pr-4 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center overflow-hidden ring-2 ring-primary/20 group-hover:ring-primary/40 transition-all">
                {user.user_metadata.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-white">
                    {(user.user_metadata.full_name || user.user_metadata.name || user.email || "U").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-white leading-tight truncate max-w-[120px]">
                  {user.user_metadata.full_name || user.user_metadata.name || user.email?.split("@")[0]}
                </span>
                <span className="text-[10px] text-gray-500 leading-tight">Free Plan</span>
              </div>
              <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isProfileOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            <AnimatePresence>
              {isProfileOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsProfileOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-3 w-64 glass border border-white/10 rounded-2xl p-2 shadow-2xl z-50"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-3 px-3 py-3 border-b border-white/5 mb-1">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {user.user_metadata.avatar_url ? (
                          <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-white">
                            {(user.user_metadata.full_name || user.user_metadata.name || user.email || "U").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {user.user_metadata.full_name || user.user_metadata.name || "User"}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>

                    <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                      <LayoutDashboard className="w-4 h-4" />
                      Dashboard
                    </button>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <div className="h-px bg-white/5 my-1" />
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-xl transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            <Link 
              href="/login" 
              className="px-6 py-2 bg-primary/10 border border-primary/30 rounded-full text-primary hover:bg-primary/20 transition-all"
            >
              Log in
            </Link>
            <Link 
              href="/login?signup=true" 
              className="px-6 py-2 bg-primary text-black font-semibold rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
            >
              Get Started
            </Link>
          </>
        )}
      </nav>

      {/* Mobile Menu Toggle */}
      <button
        className="md:hidden text-white p-2 -mr-2"
        onClick={() => setIsMobileMenuOpen((v) => !v)}
        aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={closeMobileMenu}
              className="md:hidden fixed inset-0 top-20 bg-black/60 backdrop-blur-sm z-40"
            />
            {/* Panel */}
            <motion.nav
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed top-20 left-0 right-0 z-50 glass border-t border-white/10 px-6 py-6 space-y-1"
            >
              <Link
                href="/analyze"
                onClick={closeMobileMenu}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white hover:bg-white/5 transition-colors"
              >
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <span className="font-medium">Analyze</span>
              </Link>
              <Link
                href="/script-writer"
                onClick={closeMobileMenu}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-white hover:bg-white/5 transition-colors"
              >
                <PenLine className="w-5 h-5 text-primary" />
                <span className="font-medium">Script Writer</span>
              </Link>
              <a
                href="#"
                onClick={closeMobileMenu}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                Features
              </a>
              <a
                href="#"
                onClick={closeMobileMenu}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                Pricing
              </a>

              <div className="h-px bg-white/5 my-2" />

              {user ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {user.user_metadata.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-white">
                          {(user.user_metadata.full_name || user.user_metadata.name || user.email || "U").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {user.user_metadata.full_name || user.user_metadata.name || "User"}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      closeMobileMenu();
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-all"
                  >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Sign Out</span>
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <Link
                    href="/login"
                    onClick={closeMobileMenu}
                    className="px-4 py-3 bg-primary/10 border border-primary/30 rounded-xl text-primary text-center hover:bg-primary/20 transition-all"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/login?signup=true"
                    onClick={closeMobileMenu}
                    className="px-4 py-3 bg-primary text-black font-semibold rounded-xl text-center hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
