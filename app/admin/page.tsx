import { login } from './actions'
import LoginForm from './LoginForm'

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">JFBE RSS</h1>
          <p className="mt-1 text-sm text-gray-500">Admin-Login</p>
        </div>
        <LoginForm action={login} />
      </div>
    </main>
  )
}
