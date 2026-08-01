import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../utils/apiUrl';

// Usa la misma base que muestran la documentación y la consola interactiva.
axios.defaults.baseURL = API_BASE_URL;

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
          const response = await axios.get('/api/users/profile');
          if (response.data.success) {
            setUser(response.data.user);
            localStorage.setItem('user', JSON.stringify(response.data.user));
          }
        } catch (error) {
          console.error("Session expired or invalid");
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (identifier, password) => {
    const response = await axios.post('/api/auth/login', { identifier, password });
    const { token, user: userData } = response.data;
    
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    
    // Refresh to get full profile data
    try {
      const profileRes = await axios.get('/api/users/profile');
      if (profileRes.data.success) {
        setUser(profileRes.data.user);
        localStorage.setItem('user', JSON.stringify(profileRes.data.user));
      }
    } catch (e) {}

    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
