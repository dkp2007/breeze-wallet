import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PageLoader } from './ui'

export function ProtectedRoute() {
  const { session, pendingSecondStep } = useAuth()
  const location = useLocation()
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (pendingSecondStep === null) {
    return <PageLoader />
  }
  if (pendingSecondStep) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
