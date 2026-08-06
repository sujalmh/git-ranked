export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Loading</p>
      </div>
    </div>
  );
}
