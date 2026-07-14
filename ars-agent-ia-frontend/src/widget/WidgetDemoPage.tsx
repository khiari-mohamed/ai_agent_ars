import ChatWidget from './ChatWidget';

export default function WidgetDemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-50 to-blue-50 flex items-center justify-center p-8">
      <div className="text-center max-w-lg">
        <img src="/Image1.png" alt="ARS Tunisie" className="h-16 mx-auto mb-6 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <h1 className="text-2xl font-semibold text-navy-800 mb-2">Portail Assuré</h1>
        <p className="text-slate-500 text-sm">
          Démonstration de l'Agent IA Conversationnel ARS Tunisie.
          <br />
          Cliquez sur le bouton en bas à droite pour démarrer.
        </p>
        <div className="mt-8 p-4 bg-white rounded-xl border border-surface-border shadow-card text-left">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">Informations de test</p>
          <p className="text-sm text-slate-700">CIN : <span className="font-mono font-medium">12345678</span></p>
          <p className="text-sm text-slate-700">OTP : <span className="font-mono font-medium">123456</span></p>
        </div>
      </div>
      <ChatWidget />
    </div>
  );
}