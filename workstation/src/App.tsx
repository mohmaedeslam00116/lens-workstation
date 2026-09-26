export function App() {
  return (
    <div className="flex h-screen w-screen flex-col bg-[#111111] text-gray-200">
      <header className="flex h-12 items-center justify-between border-b border-[#2a2a2a] px-4 bg-[#191919]">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full border border-gray-400 bg-transparent flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-gray-300" />
          </div>
          <span className="font-semibold tracking-wider text-sm">LENS WORKSTATION</span>
          <span className="text-xs text-gray-500 font-mono">v0.1.0</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2 py-0.5 font-mono">
            READ_ONLY_INSPECTION
          </span>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-gray-500 font-mono text-sm">
          Scaffolding Ready — Agent Canvas standing by.
        </div>
      </main>
    </div>
  );
}
