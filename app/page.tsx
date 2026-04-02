import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8">
      <Image
        src="/jfbe-long.svg"
        alt="JFBE Logo"
        width={300}
        height={100}
        priority
      />
      <p className="text-lg font-medium text-center px-4">
        Willkommen beim News-Feed der Jungfreisinnigen Kanton Bern!
      </p>
      <Link
        href="/admin"
        className="px-6 py-3 bg-navy-800 text-white rounded-md hover:opacity-90 transition-opacity"
        style={{ backgroundColor: '#014493' }}
      >
        Zum Admin-Bereich
      </Link>
    </main>
  )
}