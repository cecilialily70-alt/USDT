import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from 'sonner';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import USDTCalculator from './components/USDTCalculator';
import Security from './components/Security';
import Reviews from './components/Reviews';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
import AdminOrNotFound from './components/AdminOrNotFound';
import axios from 'axios';
import './App.css';

const HomePage = () => (
  <>
    <Hero />
    <Features />
    <HowItWorks />
    <USDTCalculator />
    <Security />
    <Reviews />
  </>
);

function App() {
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    // 核心优化 1：配置全局 Axios 拦截器。任何时刻只要返回 403，立刻强制跳离
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 403) {
          window.location.href = 'https://www.google.com';
        }
        return Promise.reject(error);
      }
    );

    // 核心优化 2：页面刚加载时，主动触发一次验证
    const checkAccess = async () => {
      try {
        await axios.get('/api/config');
        setIsAllowed(true);
      } catch (error) {
        if (error.response && error.response.status === 403) {
          window.location.href = 'https://www.google.com';
        } else {
          // Fail-Open 机制：如果只是普通的网络延迟或超时，我们仍然放行，防止误杀
          setIsAllowed(true);
        }
      }
    };
    
    checkAccess();

    // 卸载组件时移除拦截器
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  // 如果状态尚未被证实为安全（比如正在校验中），显示纯黑背景，防止非目标用户看到界面
  if (!isAllowed) {
    return <div className="min-h-screen bg-[#06080F]"></div>;
  }

  return (
    <LanguageProvider>
      <BrowserRouter>
        <div className="App min-h-screen bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] text-white">
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            {/* 拦截所有其它未知路径，交给嗅探器判断是否为后台 */}
            <Route path="*" element={<AdminOrNotFound />} />
          </Routes>
          <Footer />
          <ChatWidget />
          <Toaster position="top-center" richColors />
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;