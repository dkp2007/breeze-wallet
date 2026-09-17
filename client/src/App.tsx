import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { PageLoader } from './components/ui'
import { ProtectedRoute } from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Send from './pages/Send'
import Topup from './pages/Topup'
import Withdraw from './pages/Withdraw'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'
import { SoundProvider } from './components/Sound'

function RoutesGate() {
  const { loading, session, pendingSecondStep } = useAuth()

  if (loading) {
    return <PageLoader />
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={session && pendingSecondStep === false ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/signup" element={session && pendingSecondStep === false ? <Navigate to="/dashboard" replace /> : <Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="send" element={<Send />} />
          <Route path="topup" element={<Topup />} />
          <Route path="withdraw" element={<Withdraw />} />
          <Route path="history" element={<History />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>      <AuthProvider>
        <SoundProvider>
          <RoutesGate />
        </SoundProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
