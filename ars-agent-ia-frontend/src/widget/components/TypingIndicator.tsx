interface TypingIndicatorProps {
  label?: string;
}

export default function TypingIndicator({ label = "L'agent est en train de répondre" }: TypingIndicatorProps) {
  return (
    <div className="flex gap-2 mb-2 animate-fade-in" role="status" aria-label={label}>
      <div
        aria-hidden
        className="h-7 w-7 rounded-full bg-gradient-to-br from-white/90 to-white/60 backdrop-blur-md border border-white/70 shadow-glass-sm flex items-center justify-center flex-shrink-0 self-end"
      >
        <span className="text-[#b51a1a] font-bold text-2xs">IA</span>
      </div>
      <div className="bg-white/70 backdrop-blur-md border border-white/70 shadow-glass-sm rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-2 w-2 rounded-full bg-gradient-to-br from-[#d62121] to-[#a91717] animate-typing-dot motion-reduce:animate-none motion-reduce:opacity-60 inline-block"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}