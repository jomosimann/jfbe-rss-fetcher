import { logout } from '../actions'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <nav className="flex items-center gap-6 text-sm font-medium text-gray-600">
          <span className="text-gray-900 font-semibold">JFBE RSS</span>
          <a href="/admin/articles" className="hover:text-gray-900">Artikel</a>
          <a href="/admin/feeds" className="hover:text-gray-900">Feeds</a>
          <a href="/admin/settings" className="hover:text-gray-900">Einstellungen</a>
        </nav>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Abmelden
          </button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
