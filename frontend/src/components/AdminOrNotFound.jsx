import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminPanel from '../pages/AdminPanel';

export default function AdminOrNotFound() {
    const location = useLocation();
    const navigate = useNavigate();
    const [status, setStatus] = useState('checking'); 

    useEffect(() => {
        const checkPath = async () => {
            try {
                const res = await axios.post('/api/admin/check-path', { path: location.pathname });
                if (res.data.is_admin) {
                    setStatus('admin');
                } else {
                    setStatus('not-found');
                }
            } catch (e) {
                setStatus('not-found');
            }
        };
        checkPath();
    }, [location.pathname]);

    if (status === 'checking') {
        return <div className="min-h-screen bg-[#06080F] flex items-center justify-center text-white">Loading...</div>;
    }

    if (status === 'admin') {
        return <AdminPanel />;
    }

    navigate('/', { replace: true });
    return null;
}