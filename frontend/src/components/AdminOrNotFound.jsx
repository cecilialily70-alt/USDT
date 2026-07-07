import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import axios from 'axios';
import AdminPanel from '../pages/AdminPanel';

export default function AdminOrNotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const checkPath = async () => {
      setStatus('checking');
      setErrorMsg('');
      try {
        const res = await axios.post('/api/admin/check-path', { path: location.pathname });
        if (res.data.is_admin) {
          setStatus('admin');
        } else {
          setStatus('not-found');
        }
      } catch (e) {
        const detail = e.response?.data?.detail;
        if (typeof detail === 'string') {
          setErrorMsg(detail);
        } else if (!e.response) {
          setErrorMsg('无法连接服务器，请确认后端已启动');
        } else {
          setErrorMsg('验证失败，请刷新重试');
        }
        setStatus('error');
      }
    };
    checkPath();
  }, [location.pathname]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#06080F] flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  if (status === 'admin') {
    return (
      <>
        <AdminPanel />
        <Toaster position="top-center" richColors />
      </>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#06080F] flex flex-col items-center justify-center text-white px-4 gap-4">
        <p className="text-red-400 text-center">{errorMsg}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
        >
          刷新重试
        </button>
        <button
          onClick={() => navigate('/')}
          className="text-gray-500 hover:text-gray-300 text-sm"
        >
          返回首页
        </button>
      </div>
    );
  }

  navigate('/', { replace: true });
  return null;
}
