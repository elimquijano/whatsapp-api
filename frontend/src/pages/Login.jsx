import React, { useState } from 'react';
import {
  Container, Box, Typography, TextField, Button,
  Paper, Alert, CircularProgress, InputAdornment, IconButton,
  Link, Stack
} from '@mui/material';
import { Person, Lock, Visibility, VisibilityOff, Email, ArrowBack } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const AuthPage = () => {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(location.state?.showRegister ? false : true);
  const [step, setStep] = useState(1); // 1: Datos, 2: OTP
  const [formData, setFormData] = useState({
    username: '',
    whatsappNumber: '',
    password: '',
    code: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSendOTP = async () => {
    if (!formData.whatsappNumber || !formData.username || !formData.password) return setError('Complete todos los campos');
    setLoading(true);
    setError('');
    try {
      await axios.post('/api/auth/send-otp', { whatsappNumber: formData.whatsappNumber });
      setStep(2);
      setSuccess('Código enviado a tu WhatsApp');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar código');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (isLogin) {
      if (!formData.username || !formData.password) return setError('Complete los campos de login');
      setLoading(true);
      try {
        await login(formData.username, formData.password);
        navigate('/dashboard');
      } catch (err) {
        setError(err.response?.data?.error || 'Error al iniciar sesión');
      } finally {
        setLoading(false);
      }
    } else {
      if (step === 1) {
        await handleSendOTP();
      } else {
        setLoading(true);
        try {
          const res = await axios.post('/api/auth/register', formData);
          setSuccess(res.data.message);
          setTimeout(() => {
            setIsLogin(true);
            setStep(1);
            setSuccess('');
          }, 2000);
        } catch (err) {
          setError(err.response?.data?.error || 'Código incorrecto');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setStep(1);
    setError('');
    setSuccess('');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
      <Container maxWidth="xs">
        <IconButton onClick={() => navigate('/')} sx={{ position: 'absolute', top: 20, left: 20, color: 'white' }}><ArrowBack /></IconButton>
        <Paper elevation={10} sx={{ p: 5, borderRadius: 4, background: 'rgba(255, 255, 255, 0.95)' }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 900, color: 'primary.main', mb: 1 }}>{isLogin ? 'LOGIN' : 'SIGN UP'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {isLogin ? 'Acceso Seguro' : step === 1 ? 'Prueba 3 días gratis Pro' : 'Ingresa el código enviado a tu WA'}
            </Typography>
          </Box>
          
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}
          
          <Box component="form" onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                <TextField fullWidth margin="normal" label="Usuario" name="username" value={formData.username} onChange={handleChange} />
                {!isLogin && <TextField fullWidth margin="normal" label="WhatsApp (con país)" name="whatsappNumber" placeholder="549351..." value={formData.whatsappNumber} onChange={handleChange} />}
                <TextField fullWidth margin="normal" label="Contraseña" type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} 
                  InputProps={{ endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword(!showPassword)}>{showPassword ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }} />
              </>
            ) : (
              <TextField fullWidth margin="normal" label="Código de 6 dígitos" name="code" value={formData.code} onChange={handleChange} autoFocus />
            )}
            
            <Button type="submit" fullWidth variant="contained" disabled={loading} sx={{ mt: 4, py: 1.8, fontWeight: 800 }}>
              {loading ? <CircularProgress size={24} color="inherit" /> : isLogin ? 'Entrar' : step === 1 ? 'Enviar Código' : 'Verificar y Crear'}
            </Button>

            <Stack sx={{ mt: 3, textAlign: 'center' }}>
              <Link component="button" variant="body2" type="button" onClick={toggleAuthMode} sx={{ fontWeight: 600 }}>
                {isLogin ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
              </Link>
            </Stack>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default AuthPage;