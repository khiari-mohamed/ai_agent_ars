import { Link } from 'react-router-dom';
import ChatWidget from './ChatWidget';

export default function WidgetDemoPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f4f2] flex items-center justify-center p-8">
      <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-red-400/20 blur-[100px] animate-float motion-reduce:animate-none" aria-hidden />
      <div className="pointer-events-none absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-sage-400/15 blur-[110px] animate-float motion-reduce:animate-none" style={{ animationDelay: '1.5s' }} aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-red-300/15 blur-[100px] animate-float motion-reduce:animate-none" style={{ animationDelay: '3s' }} aria-hidden />

      <div className="relative z-10 text-center max-w-lg">
        <div className="inline-flex items-center justify-center mb-6">
          <img
            src="/Image1.png"
            alt="ARS Tunisie"
            className="h-16 mx-auto object-contain drop-shadow-sm"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-2 tracking-tight">Portail Assuré</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Démonstration de l&apos;Agent IA Conversationnel ARS Tunisie.
          <br />
          Cliquez sur le bouton en bas à droite pour démarrer.
        </p>
        <Link
          to="/admin/login"
          className="mt-8 inline-block text-xs text-slate-400 underline-offset-4 hover:text-slate-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 rounded"
        >
          Espace administration
        </Link>
      </div>
      <ChatWidget />
    </main>
  );
}