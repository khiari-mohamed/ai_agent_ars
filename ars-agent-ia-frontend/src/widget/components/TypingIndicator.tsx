export default function TypingIndicator() {
  return (
    <div className="flex gap-2 mb-2 animate-fade-in" role="status" aria-label="L'agent est en train de répondre">
      <div className="h-7 w-7 rounded-full bg-navy-100 flex items-center justify-center flex-shrink-0 self-end">
        <span className="text-navy-600 font-bold text-2xs">IA</span>
      </div>
      <div className="bg-surface-raised border border-surface-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-navy-300 animate-typing-dot inline-block"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}