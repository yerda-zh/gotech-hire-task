import React, { useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ChatPage from './components/ChatPage';
import { AuthContext } from './context/AuthContext';
import { API_URL } from './constants';

function getUsernameFromToken(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username ?? '';
  } catch {
    return '';
  }
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [userId, setUserId] = useState<number | null>(
    localStorage.getItem('userId') ? parseInt(localStorage.getItem('userId')!) : null
  );

  // initialize socket synchronously if token already exists (e.g. page refresh)
  const socketRef = useRef<Socket | null>(
    token ? io(API_URL, { auth: { token } }) : null
  );

  const handleLogin = (newToken: string, newUserId: number) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('userId', String(newUserId));
    // create socket immediately on login
    socketRef.current = io(API_URL, { auth: { token: newToken } });
    setToken(newToken);
    setUserId(newUserId);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    socketRef.current?.disconnect();
    socketRef.current = null;
    setToken(null);
    setUserId(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/chat" /> : <LoginPage onLogin={handleLogin} />} />
        <Route path="/register" element={token ? <Navigate to="/chat" /> : <RegisterPage onLogin={handleLogin} />} />
        <Route
          path="/chat"
          element={
            token && userId && socketRef.current ? (
              <AuthContext.Provider value={{ token, userId, username: getUsernameFromToken(token) }}>
                <ChatPage socket={socketRef.current} onLogout={handleLogout} />
              </AuthContext.Provider>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="*" element={<Navigate to={token ? '/chat' : '/login'} />} />
      </Routes>
    </BrowserRouter>
  );
}